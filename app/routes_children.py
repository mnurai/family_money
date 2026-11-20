"""API routes for parents controlling a child's accounts (FR-13, BR-10).

Include the router in the application:  app.include_router(router)
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.security import Principal, get_db, require
from app.services import child_access, child_limits

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


# ---- Monthly spending limit of a child ----

class LimitRequest(BaseModel):
    monthly_limit: Decimal


@router.get("/children/{child_member_id}/limit")
def get_limit_route(child_member_id: int, principal: Principal = Depends(require("manage_child_limit")),
                    db: Session = Depends(get_db)):
    return child_limits.get_limit_status(
        db, family_id=principal.family_id, actor_role=principal.role, child_member_id=child_member_id)


@router.put("/children/{child_member_id}/limit")
def set_limit_route(child_member_id: int, body: LimitRequest,
                    principal: Principal = Depends(require("manage_child_limit")), db: Session = Depends(get_db)):
    return child_limits.set_limit(
        db, family_id=principal.family_id, actor_user_id=principal.user_id, actor_role=principal.role,
        child_member_id=child_member_id, monthly_limit=body.monthly_limit)


@router.delete("/children/{child_member_id}/limit", status_code=status.HTTP_204_NO_CONTENT)
def remove_limit_route(child_member_id: int, principal: Principal = Depends(require("manage_child_limit")),
                       db: Session = Depends(get_db)):
    child_limits.remove_limit(
        db, family_id=principal.family_id, actor_user_id=principal.user_id, actor_role=principal.role,
        child_member_id=child_member_id)
