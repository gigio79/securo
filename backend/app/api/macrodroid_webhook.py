"""MacroDroid webhook endpoint for automatic bank notification processing.

Receives text notifications from MacroDroid (Android automation app) and
creates transactions automatically in Talisma.
"""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_async_session
from app.core.workspace_context import WorkspaceContext, current_writable_workspace
from app.models.account import Account
from app.schemas.transaction import TransactionCreate, TransactionRead
from app.services import transaction_service

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


class MacroDroidPayload(BaseModel):
    """Payload from MacroDroid notification capture."""
    text: str
    account_id: Optional[str] = None  # Optional override, defaults to Carteira
    workspace_id: Optional[str] = None  # Optional override


class ParsedNotification:
    """Parsed bank notification result."""
    type: str  # "credit" or "debit"
    amount: Decimal
    description: str
    payee: Optional[str] = None
    date: date = None

    def __init__(self):
        self.date = date.today()


# ──────────────────────────────────────────────────────────────
# Notification parsers (add new formats here)
# ──────────────────────────────────────────────────────────────

def parse_pix_received(text: str) -> Optional[ParsedNotification]:
    """Parse Pix received notification.
    
    Examples:
        "Pix recebidoVoce recebeu um Pix de Giovanni Bispo Dos Reis Silva CPF *.727.668- no valor de R$ 0,65."
        "Pix recebido de João Silva no valor de R$ 50,00"
        "PicPay • agoraGIOVANNI BISPO DOS REIS SILVA enviou um Pix para você Você recebeu um Pix de R$ 0,65."
    """
    # Pattern 1: "Pix recebido" + "no valor de R$ X,XX"
    pattern = r'Pix\s+recebido.*?de\s+(.+?)(?:\s+CPF\s+\*?[\d.\-]+)?\s+no\s+valor\s+de\s+R\$\s*([\d.,]+)'
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    
    if match:
        parsed = ParsedNotification()
        parsed.type = "credit"
        parsed.payee = match.group(1).strip()
        parsed.description = f"Pix recebido - {parsed.payee}"
        parsed.amount = _parse_amount(match.group(2))
        return parsed
    
    # Pattern 2: "enviou um Pix para você" + "Você recebeu um Pix de R$ X,XX"
    pattern2 = r'enviou\s+um\s+Pix\s+para\s+você.*?Você\s+recebeu\s+um\s+Pix\s+de\s+R\$\s*([\d.,]+)'
    match2 = re.search(pattern2, text, re.IGNORECASE | re.DOTALL)
    
    if match2:
        parsed = ParsedNotification()
        parsed.type = "credit"
        # Extract sender name (before "enviou")
        name_pattern = r'([A-ZÀ-Ú\s]+)\s+enviou\s+um\s+Pix'
        name_match = re.search(name_pattern, text)
        parsed.payee = name_match.group(1).strip() if name_match else "Desconhecido"
        parsed.description = f"Pix recebido - {parsed.payee}"
        parsed.amount = _parse_amount(match2.group(1))
        return parsed
    
    return None


def parse_pix_sent(text: str) -> Optional[ParsedNotification]:
    """Parse Pix sent notification.
    
    Examples:
        "Neon • agoraPix enviadoVocê enviou um Pix no valor de R$ 0,65."
        "PicPay • agoraPix enviadoVocê enviou um Pix de R$ 50,00"
    """
    # Pattern: "Pix enviado" + "R$ X,XX"
    pattern = r'Pix\s+enviado.*?(?:no\s+valor\s+de|de)\s+R\$\s*([\d.,]+)'
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    
    if match:
        parsed = ParsedNotification()
        parsed.type = "debit"
        parsed.description = "Pix enviado"
        parsed.amount = _parse_amount(match.group(1))
        return parsed
    
    return None


def parse_debit_purchase(text: str) -> Optional[ParsedNotification]:
    """Parse debit/credit card purchase notification.
    
    Examples:
        "Compra aprovada no cartão final 1234 - R$ 50,00 - Shopping ABC"
        "Compra aprovada R$ 150,00 noShopping ABC"
    """
    # Pattern: "Compra" + amount + optional location
    pattern = r'Compra\s+aprovada.*?(?:R\$\s*([\d.,]+)).*?(?:no|em)\s*(.+?)(?:\s*$|\s+via)'
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    
    if match:
        parsed = ParsedNotification()
        parsed.type = "debit"
        parsed.amount = _parse_amount(match.group(1))
        location = match.group(2).strip() if match.group(2) else "Compra"
        parsed.description = f"Compra - {location}"
        return parsed
    
    # Simpler pattern: just amount
    pattern_simple = r'Compra.*?R\$\s*([\d.,]+)'
    match_simple = re.search(pattern_simple, text, re.IGNORECASE)
    
    if match_simple:
        parsed = ParsedNotification()
        parsed.type = "debit"
        parsed.amount = _parse_amount(match_simple.group(1))
        parsed.description = "Compra aprovada"
        return parsed
    
    return None


def parse_transfer_received(text: str) -> Optional[ParsedNotification]:
    """Parse transfer received notification.
    
    Examples:
        "Transferência recebida de João Silva - R$ 1.000,00"
        "TED recebida de Maria - R$ 500,00"
    """
    pattern = r'(?:Transferência|TED)\s+recebida?\s+de\s+(.+?)\s*-\s*R\$\s*([\d.,]+)'
    match = re.search(pattern, text, re.IGNORECASE)
    
    if match:
        parsed = ParsedNotification()
        parsed.type = "credit"
        parsed.payee = match.group(1).strip()
        parsed.description = f"Transferência recebida - {parsed.payee}"
        parsed.amount = _parse_amount(match.group(2))
        return parsed
    
    return None


def parse_generic_amount(text: str) -> Optional[ParsedNotification]:
    """Fallback parser: try to extract any R$ amount from the text."""
    pattern = r'R\$\s*([\d.,]+)'
    match = re.search(pattern, text, re.IGNORECASE)
    
    if match:
        parsed = ParsedNotification()
        # Guess type based on keywords
        text_lower = text.lower()
        if any(kw in text_lower for kw in ['receb', 'pix', 'crédito', 'credito', 'transferência recebida']):
            parsed.type = "credit"
        else:
            parsed.type = "debit"
        
        parsed.amount = _parse_amount(match.group(1))
        parsed.description = text[:100]  # Use first 100 chars as description
        return parsed
    
    return None


def _parse_amount(amount_str: str) -> Decimal:
    """Parse Brazilian currency format to Decimal.
    
    Handles: "0,65" -> 0.65, "1.234,56" -> 1234.56, "50" -> 50.00
    """
    # Remove dots (thousands separator) and replace comma with period
    cleaned = amount_str.replace('.', '').replace(',', '.')
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"Could not parse amount: {amount_str}")


# ──────────────────────────────────────────────────────────────
# Main parser dispatcher
# ──────────────────────────────────────────────────────────────

def parse_notification(text: str) -> Optional[ParsedNotification]:
    """Try all parsers in order until one matches."""
    parsers = [
        parse_pix_received,
        parse_pix_sent,
        parse_debit_purchase,
        parse_transfer_received,
        parse_generic_amount,  # Fallback - always last
    ]
    
    for parser in parsers:
        result = parser(text)
        if result and result.amount > 0:
            return result
    
    return None


# ──────────────────────────────────────────────────────────────
# API endpoint
# ──────────────────────────────────────────────────────────────

@router.post("/macrodroid", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def receive_macrodroid_notification(
    payload: MacroDroidPayload,
    authorization: Optional[str] = Header(None, description="Basic Auth (user:pass) or API Key"),
    x_api_key: Optional[str] = Header(None, description="API key for MacroDroid authentication"),
    session: AsyncSession = Depends(get_async_session),
):
    """Receive bank notification from MacroDroid and create transaction.
    
    Supports two authentication methods:
    - Basic Auth: Authorization: Basic base64(user:pass)
    - API Key: X-API-Key: your-api-key
    """
    settings = get_settings()
    
    # Authentication: Basic Auth or API Key
    authenticated = False
    
    # Method 1: Basic Auth
    if authorization and authorization.startswith("Basic "):
        import base64
        try:
            decoded = base64.b64decode(authorization[6:]).decode("utf-8")
            user, password = decoded.split(":", 1)
            if user == "talisma" and password == settings.macrodroid_api_key:
                authenticated = True
        except Exception:
            pass
    
    # Method 2: API Key in header
    if not authenticated and x_api_key:
        if x_api_key == settings.macrodroid_api_key:
            authenticated = True
    
    if not authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use Basic Auth (user:pass) or X-API-Key header."
        )
    
    # Parse notification
    parsed = parse_notification(payload.text)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse notification text: {payload.text[:200]}"
        )
    
    # Get workspace and account
    from app.models.workspace import Workspace
    from app.models.workspace import WorkspaceMember
    
    # Find account (default to Carteira or use provided account_id)
    if payload.account_id:
        account_id = uuid.UUID(payload.account_id)
        # Get account's workspace
        result = await session.execute(
            select(Account).where(Account.id == account_id)
        )
        account = result.scalar_one_or_none()
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Account not found: {account_id}"
            )
        workspace_id = account.workspace_id
    else:
        # Find "Carteira" account first
        result = await session.execute(
            select(Account).where(
                Account.name.ilike("%carteira%"),
                Account.is_closed == False
            ).limit(1)
        )
        account = result.scalar_one_or_none()
        
        if not account:
            # Fallback to first checking account
            result = await session.execute(
                select(Account).where(
                    Account.type == "checking",
                    Account.is_closed == False
                ).limit(1)
            )
            account = result.scalar_one_or_none()
        
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found. Please provide account_id."
            )
        
        account_id = account.id
        workspace_id = account.workspace_id
    
    # Get workspace owner
    result = await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role.in_(["owner", "editor"])
        ).limit(1)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No writable workspace member found"
        )
    
    user_id = member.user_id
    
    # Create transaction
    tx_data = TransactionCreate(
        account_id=account_id,
        description=parsed.description,
        amount=parsed.amount,
        type=parsed.type,
        date=parsed.date,
        currency="BRL",
        payee_raw=parsed.payee,
        notes=f"Auto-created from MacroDroid: {payload.text[:200]}"
    )
    
    try:
        transaction = await transaction_service.create_transaction(
            session, workspace_id, user_id, tx_data
        )
        return TransactionRead.model_validate(transaction, from_attributes=True)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
