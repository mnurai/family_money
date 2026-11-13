"""Permission check for API requests (NFR-02, NFR-03): who may do what.

Authentication (login, password check, session cookie) is a separate job. It must provide
`get_current_principal`: a function that returns the logged-in person for this request as a
Principal. This module does not care how the person was recognised.

What the authentication has to guarantee (docs/10-architecture-and-security.md, sections 3.1 and 4):
  - user_id comes from the session, never from the request body;
  - member_id, family_id and role are read from the database on EVERY request, so a role change
    or a block works at the next request (US-04, FR-39). A user without a family has role None;
    the system administrator has role "ADMIN" and no family.

Then `require("action")` asks the permission matrix (app/services/permissions.py).
The application connects the real functions like this:
    app.dependency_overrides[get_db] = <function that yields a database Session>
    app.dependency_overrides[get_current_principal] = <function from the authentication>
"""
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.services.permissions import can

MSG_FORBIDDEN = "You do not have permission to do this"


@dataclass(frozen=True)
class Principal:
    """The logged-in person for this request."""
    user_id: int
    member_id: Optional[int]   # None for a user without a family and for the system administrator
    family_id: Optional[int]
    role: Optional[str]        # OWNER / ADULT / CHILD / ADMIN, or None if the user has no family yet


def get_db() -> Session:
    """Placeholder. The application replaces it with the real database session."""
    raise RuntimeError("get_db must be overridden by the application")


def get_current_principal() -> Principal:
    """Placeholder. The authentication replaces it: it returns the Principal of the session,
    or raises HTTP 401 if nobody is logged in."""
    raise RuntimeError("get_current_principal must be overridden by the authentication")


def require(action: str):
    """Dependency: the logged-in user must be allowed to do `action` (permission matrix)."""

    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not can(principal.role, action):
            raise HTTPException(status.HTTP_403_FORBIDDEN, MSG_FORBIDDEN)
        return principal

    return dependency
