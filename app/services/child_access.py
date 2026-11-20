"""Parents control what a child can use: share accounts with a child and take the access back.

FR-13, BR-10. Only roles that may `share_account` in the permission matrix (the Owner)
can do this. A child can then record income and expenses only on the shared accounts;
record_transaction() already checks ACCOUNT_ACCESS for that. Every change is written to the
audit log (FR-37).
"""
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, AccountAccess, AuditLog, FamilyMember
from app.services.permissions import can


def _check_permission(actor_role: str) -> None:  # это делает владелец?
    if not can(actor_role, "share_account"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to do this")


def _get_child(db: Session, family_id: int, member_id: int) -> FamilyMember: # это ребёнок из моей семьи?
    member = db.get(FamilyMember, member_id)
    # Another family's member looks the same as a missing one (NFR-03).
    if member is None or member.family_id != family_id or member.removed_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    if member.role != "CHILD":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Accounts can only be shared with a Child Member")
    return member


def _get_account(db: Session, family_id: int, account_id: int) -> Account:
    account = db.get(Account, account_id)
    if account is None or account.family_id != family_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    return account


def grant_access(db: Session, *, family_id: int, actor_user_id: int, actor_role: str,
                 child_member_id: int, account_id: int) -> AccountAccess:
    """Share an account with a child. Doing it twice changes nothing."""
    _check_permission(actor_role)
    _get_child(db, family_id, child_member_id)
    account = _get_account(db, family_id, account_id)  #счёт из моей семьи?
    if account.is_archived:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An archived account cannot be shared")

    existing = db.get(AccountAccess, (account_id, child_member_id))
    if existing is not None:
        return existing

    row = AccountAccess(account_id=account_id, member_id=child_member_id) # доступ выдан
    db.add(row)
    db.add(AuditLog(
        family_id=family_id, actor_user_id=actor_user_id, entity_type="ACCOUNT_ACCESS",
        entity_id=account_id, action="CREATE",
        new_value={"account_id": account_id, "member_id": child_member_id},
    ))
    db.commit()
    return row


def revoke_access(db: Session, *, family_id: int, actor_user_id: int, actor_role: str,
                  child_member_id: int, account_id: int) -> None:
    """Take the access back. The child no longer sees or uses the account."""
    _check_permission(actor_role)
    _get_child(db, family_id, child_member_id)
    _get_account(db, family_id, account_id)

    row = db.get(AccountAccess, (account_id, child_member_id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This account is not shared with the child")

    db.delete(row)
    db.add(AuditLog(
        family_id=family_id, actor_user_id=actor_user_id, entity_type="ACCOUNT_ACCESS",
        entity_id=account_id, action="DELETE",
        old_value={"account_id": account_id, "member_id": child_member_id},
    ))
    db.commit()


def list_child_accounts(db: Session, *, family_id: int, actor_role: str, child_member_id: int) -> list:
    """Accounts that are shared with this child."""
    _check_permission(actor_role)
    _get_child(db, family_id, child_member_id)
    rows = db.execute(
        select(Account.account_id, Account.name)
        .join(AccountAccess, AccountAccess.account_id == Account.account_id)
        .where(AccountAccess.member_id == child_member_id, Account.family_id == family_id)
        .order_by(Account.account_id)
    ).all()
    return [{"account_id": r.account_id, "name": r.name} for r in rows]
