"""Register / login / logout endpoints and the real `get_current_principal` (US-01, US-02, NFR-05).

Connect it in the application (one call):
    from app.routes_auth import install_auth
    install_auth(app)

This includes the router and replaces the placeholder `get_current_principal` of app/security.py.
The application still has to set `app.dependency_overrides[get_db]` itself.

The session is a cookie: HttpOnly, SameSite=Lax, Secure (switch off only for local http with
COOKIE_SECURE=0). A fresh cookie is sent on every request, so it ends after 30 minutes of inactivity.
"""
import os

from fastapi import APIRouter, Depends, FastAPI, Request, Response, status
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FamilyMember
from app.models_auth import User
from app.security import Principal, get_current_principal, get_db
from app.services import auth

COOKIE_NAME = "fbt_session"
router = APIRouter(prefix="/auth")


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    accept_privacy: bool = False


class LoginRequest(BaseModel):
    email: str
    password: str


def _secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "1") != "0"


def _set_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        COOKIE_NAME, auth.issue_token(user_id),
        max_age=auth.SESSION_MINUTES * 60, httponly=True, samesite="lax", secure=_secure(), path="/",
    )


def _public(user: User) -> dict:
    # Never return password_hash or the lock fields.
    return {"user_id": user.user_id, "email": user.email, "full_name": user.full_name}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_route(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    user = auth.register(db, full_name=body.full_name, email=body.email, password=body.password,
                         accept_privacy=body.accept_privacy)
    _set_cookie(response, user.user_id)  # the new user is logged in (US-01.1)
    return _public(user)


@router.post("/login")
def login_route(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = auth.login(db, email=body.email, password=body.password)
    _set_cookie(response, user.user_id)
    return _public(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_route(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=_secure())


def authenticated_principal(request: Request, response: Response, db: Session = Depends(get_db)) -> Principal:
    """The real replacement for security.get_current_principal.

    user_id comes from the signed cookie; member_id, family_id, role and is_active are read from the
    database on EVERY request, so a role change or a block works at the next request (FR-39, US-04).
    """
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, auth.MSG_NOT_LOGGED_IN)
    user_id = auth.read_token(token)

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, auth.MSG_SESSION_ENDED)
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, auth.MSG_BLOCKED)

    _set_cookie(response, user_id)  # sliding session: 30 minutes from the last request

    if user.is_system_admin:
        return Principal(user_id, None, None, "ADMIN")
    member = db.scalar(select(FamilyMember).where(FamilyMember.user_id == user_id,
                                                  FamilyMember.removed_at.is_(None)))
    if member is None:  # registered, but no family yet
        return Principal(user_id, None, None, None)
    return Principal(user_id, member.member_id, member.family_id, member.role)


@router.get("/me")
def me_route(principal: Principal = Depends(get_current_principal), db: Session = Depends(get_db)):
    user = db.get(User, principal.user_id)
    return {**_public(user), "family_id": principal.family_id, "role": principal.role}


def install_auth(app: FastAPI) -> None:
    app.include_router(router)
    app.dependency_overrides[get_current_principal] = authenticated_principal
