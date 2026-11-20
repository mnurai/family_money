"""API routes for parents controlling a child's accounts (FR-13, BR-10).

Include the router in the application:  app.include_router(router)
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.security import Principal, get_db, require
from app.services import child_access

router = APIRouter()


@router.get("/children/{child_member_id}/accounts")
def list_child_accounts_route(child_member_id: int, principal: Principal = Depends(require("share_account")),
                              db: Session = Depends(get_db)):
    return child_access.list_child_accounts(
        db, family_id=principal.family_id, actor_role=principal.role, child_member_id=child_member_id)


@router.put("/children/{child_member_id}/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def share_account_route(child_member_id: int, account_id: int, principal: Principal = Depends(require("share_account")),
                        db: Session = Depends(get_db)):
    child_access.grant_access(
        db, family_id=principal.family_id, actor_user_id=principal.user_id, actor_role=principal.role,
        child_member_id=child_member_id, account_id=account_id)


@router.delete("/children/{child_member_id}/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def unshare_account_route(child_member_id: int, account_id: int, principal: Principal = Depends(require("share_account")),
                          db: Session = Depends(get_db)):
    child_access.revoke_access(
        db, family_id=principal.family_id, actor_user_id=principal.user_id, actor_role=principal.role,
        child_member_id=child_member_id, account_id=account_id)
