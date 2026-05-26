"""Auto-stamp `workspace_id` on financial entities when only `user_id` is set.

Provides backwards compatibility for code that pre-dates the workspace
column. When a row is inserted without `workspace_id` but with `user_id`,
the listener resolves the user's first workspace and fills it in. Once
the query layer + every caller passes `workspace_id` explicitly, the
listeners can be removed.

Resolution caches per `(session, user_id)` to avoid re-querying for the
common case of many rows being inserted under the same user (imports,
seed data, test fixtures).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import event, select
from sqlalchemy.orm import Mapper, Session

from app.models.account import Account
from app.models.asset import Asset
from app.models.asset_group import AssetGroup
from app.models.bank_connection import BankConnection
from app.models.budget import Budget
from app.models.category import Category
from app.models.category_group import CategoryGroup
from app.models.credit_card_bill import CreditCardBill
from app.models.goal import Goal
from app.models.group import Group
from app.models.import_log import ImportLog
from app.models.payee import Payee, PayeeMapping
from app.models.recurring_transaction import RecurringTransaction
from app.models.rule import Rule
from app.models.transaction import Transaction
from app.models.transaction_attachment import TransactionAttachment
from app.models.workspace import Workspace, WorkspaceMember


_AUTOSTAMP_MODELS = (
    Account,
    Asset,
    AssetGroup,
    BankConnection,
    Budget,
    Category,
    CategoryGroup,
    CreditCardBill,
    Goal,
    Group,
    ImportLog,
    Payee,
    PayeeMapping,
    RecurringTransaction,
    Rule,
    Transaction,
    TransactionAttachment,
)


def _cache_key(session: Session, user_id: uuid.UUID) -> str:
    return f"_ws_autostamp:{id(session)}:{user_id}"


def _resolve_workspace_for_user(session: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    """Find the user's first workspace. Synchronous — listener runs on the sync mapper."""
    # The listener is invoked from a sync-binding even in async sessions
    # (SQLAlchemy translates), so use the sync-style execute.
    row = session.execute(
        select(Workspace.id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user_id,
            Workspace.is_archived.is_(False),
        )
        .order_by(Workspace.created_at.asc())
        .limit(1)
    ).first()
    return row[0] if row else None


def _before_insert(mapper: Mapper, connection: Any, target: Any) -> None:
    if getattr(target, "workspace_id", None) is not None:
        return
    user_id = getattr(target, "user_id", None)
    if user_id is None:
        return
    # Use the sync session bound to this connection. Mapper events fire
    # inside a flush, so the session is reachable via the target's
    # InstanceState.
    from sqlalchemy.orm import object_session
    session = object_session(target)
    if session is None:
        return
    cache_key = _cache_key(session, user_id)
    ws_id = getattr(session, cache_key, None)
    if ws_id is None:
        ws_id = _resolve_workspace_for_user(session, user_id)
        if ws_id is None:
            return
        setattr(session, cache_key, ws_id)
    target.workspace_id = ws_id


def install_workspace_autostamp() -> None:
    """Idempotent: register the listener on each model exactly once."""
    for model in _AUTOSTAMP_MODELS:
        if not event.contains(model, "before_insert", _before_insert):
            event.listen(model, "before_insert", _before_insert)


# Install immediately on import so it's active for the FastAPI app + tests.
install_workspace_autostamp()
