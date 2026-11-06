"""Who may do what: the permission matrix as code.

Source: docs/02-stakeholders-and-users.md section 3 and docs/10-architecture-and-security.md
section 3.2. Role names are the same as in app/models.py (OWNER, ADULT, CHILD) plus ADMIN
for the system administrator.

These functions only answer yes or no. The caller decides what to do with the answer
(for example raise HTTP 403). Recording transactions already checks its own rules inside
app/services/transactions.py (BR-10); this module covers the other actions and can be
used there later, so the matrix lives in one place.
"""

ALLOWED = {
    "invite_member":         {"OWNER"},
    "share_account":         {"OWNER"},
    "archive_account":       {"OWNER"},
    "edit_account":          {"OWNER", "ADULT"},
    "record_income_expense": {"OWNER", "ADULT", "CHILD"},  # child: only on shared accounts, see can_use_account
    "record_transfer":       {"OWNER", "ADULT"},           # BR-10: a child cannot record a transfer
    "manage_budgets":        {"OWNER", "ADULT"},
    "view_family_total":     {"OWNER", "ADULT"},           # D-2, BR-13: never shown to a child
    "export_csv":            {"OWNER", "ADULT"},
    "view_audit_log":        {"OWNER"},
    "block_user":            {"ADMIN"},
}


def can(role, action):
    """True if this role may do this action. Unknown roles and actions are always refused."""
    return role in ALLOWED.get(action, set())


def can_use_account(role, account_id, shared_account_ids):
    """Owner and adult may use any account of their family. A child only the accounts shared with them (BR-10)."""
    if role in ("OWNER", "ADULT"):
        return True
    if role == "CHILD":
        return account_id in shared_account_ids
    return False
