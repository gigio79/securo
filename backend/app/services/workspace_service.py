"""Workspace lifecycle + membership helpers.

The Workspace entity sits between User and every financial entity. A
user always belongs to at least one workspace — their auto-created
Personal workspace from registration. Additional workspaces (Freelancer,
Small Business, etc.) can be created later via templates.
"""
import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WORKSPACE_ROLES


def _resolve_personal_name(lang: Optional[str]) -> str:
    """Localized default name for the auto-created Personal workspace."""
    if lang and lang.lower().startswith("pt"):
        return "Pessoal"
    return "Personal"


async def create_personal_workspace_for_user(
    session: AsyncSession,
    user: User,
    *,
    commit: bool = False,
) -> Workspace:
    """Create the user's auto-default Personal workspace + owner membership.

    Idempotent: if the user already owns a personal workspace (e.g. the
    migration ran), returns the existing one.

    Caller is responsible for committing unless `commit=True`. Defaults
    to flush-only because callers often want to bundle this with the
    user-create transaction.
    """
    existing = await session.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user.id,
            Workspace.kind == "personal",
            Workspace.created_by_user_id == user.id,
        )
        .limit(1)
    )
    found = existing.scalar_one_or_none()
    if found:
        return found

    prefs = user.preferences or {}
    lang = prefs.get("language")
    workspace = Workspace(
        name=_resolve_personal_name(lang),
        kind="personal",
        created_by_user_id=user.id,
        default_currency=prefs.get("currency_display", "USD"),
        locale=lang,
    )
    session.add(workspace)
    await session.flush()

    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=user.id,
        role="owner",
    )
    session.add(membership)
    await session.flush()
    if commit:
        await session.commit()
    return workspace


async def get_user_workspaces(session: AsyncSession, user_id: uuid.UUID) -> list[Workspace]:
    """Return all workspaces the user is a member of, oldest first."""
    result = await session.execute(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user_id,
            Workspace.is_archived.is_(False),
        )
        .order_by(Workspace.created_at.asc())
    )
    return list(result.scalars().all())


async def get_default_workspace(session: AsyncSession, user_id: uuid.UUID) -> Optional[Workspace]:
    """The user's first (oldest) workspace — used when no X-Workspace-Id header is set."""
    workspaces = await get_user_workspaces(session, user_id)
    return workspaces[0] if workspaces else None


async def get_membership(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Optional[WorkspaceMember]:
    """Return the user's membership row for a workspace, or None."""
    result = await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def require_membership(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    min_role: Optional[str] = None,
) -> WorkspaceMember:
    """Get the user's membership or raise 403/404.

    `min_role` enforces a role floor: 'viewer' (any membership), 'editor'
    (no read-only), 'owner' (owner only).
    """
    member = await get_membership(session, workspace_id, user_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if min_role is None:
        return member
    role_rank = {"viewer": 1, "editor": 2, "owner": 3}
    if role_rank.get(member.role, 0) < role_rank.get(min_role, 0):
        raise HTTPException(status_code=403, detail="Insufficient role")
    return member


async def list_members(session: AsyncSession, workspace_id: uuid.UUID) -> list[tuple[WorkspaceMember, User]]:
    """Return (membership, user) tuples for everyone in the workspace."""
    result = await session.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
    )
    return [(row[0], row[1]) for row in result.all()]


async def add_member(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str = "editor",
    invited_by_user_id: Optional[uuid.UUID] = None,
) -> WorkspaceMember:
    """Insert a new membership. Caller validates the inviter's permission."""
    if role not in WORKSPACE_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role}")
    existing = await get_membership(session, workspace_id, user_id)
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member")
    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=user_id,
        role=role,
        invited_by_user_id=invited_by_user_id,
    )
    session.add(member)
    await session.flush()
    return member


async def update_member_role(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    new_role: str,
) -> WorkspaceMember:
    if new_role not in WORKSPACE_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {new_role}")
    member = await get_membership(session, workspace_id, user_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    # Block demoting the sole owner — leaves the workspace ownerless.
    if member.role == "owner" and new_role != "owner":
        owners = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.role == "owner",
            )
        )
        owner_rows = owners.scalars().all()
        if len(owner_rows) <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the sole owner")
    member.role = new_role
    await session.flush()
    return member


async def remove_member(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    member = await get_membership(session, workspace_id, user_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "owner":
        owners = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.role == "owner",
            )
        )
        if len(owners.scalars().all()) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the sole owner")
    await session.delete(member)
    await session.flush()
