"""Who may do what: the permission matrix as code.

Source: docs/02-stakeholders-and-users.md section 3 and docs/10-architecture-and-security.md
section 3.2. Role names are the same as in app/models.py (OWNER, ADULT, CHILD) plus ADMIN
for the system administrator. A logged-in user who is not yet in any family has no role (None).

These functions only answer yes or no. The caller decides what to do with the answer
(for example raise HTTP 403). Recording transactions already checks its own rules inside
app/services/transactions.py (BR-10); this module covers the other actions and can be
used there later, so the matrix lives in one place.

Rows marked with a restriction in the matrix (shared accounts only, own transactions only)
need a second check: use can_use_account() or can_modify_transaction() after can().
"""

OWNER, ADULT, CHILD, ADMIN = "OWNER", "ADULT", "CHILD", "ADMIN"

ALLOWED = {
    # --- Family and members ---
    "create_family":         {None},                    # BR-17: only a user who has no family yet
    "invite_member":         {OWNER},
    "remove_member":         {OWNER},
    "change_member_role":    {OWNER},
    "transfer_ownership":    {OWNER},                   # BR-18
    # --- Accounts ---
    "create_account":        {OWNER, ADULT},
    "edit_account":          {OWNER, ADULT},
    "archive_account":       {OWNER},                   # adult: no archive
    "share_account":         {OWNER},
    "view_accounts":         {OWNER, ADULT, CHILD},     # child: shared accounts only, see can_use_account
    # --- Transactions ---
    "record_income_expense": {OWNER, ADULT, CHILD},     # child: shared accounts only, see can_use_account
    "record_transfer":       {OWNER, ADULT},            # BR-10: a child cannot record a transfer
    # edit / delete a transaction: see can_modify_transaction (BR-11)
    # --- Planning ---
    "manage_categories":     {OWNER, ADULT},
    "manage_recurring_rules": {OWNER, ADULT},
    "manage_budgets":        {OWNER, ADULT},
    "manage_goals":          {OWNER, ADULT},
    # --- Reports ---
    "view_reports":          {OWNER, ADULT, CHILD},     # child: shared accounts only (BR-10)
    "view_family_reports":   {OWNER, ADULT},            # D-2, BR-13: never shown to a child
    "view_family_total":     {OWNER, ADULT},            # D-2, BR-13: never shown to a child
    "export_csv":            {OWNER, ADULT},
    # --- Audit log ---
    "view_audit_log":        {OWNER, ADMIN},            # admin sees metadata only (who, when, what)
    "view_audit_log_details": {OWNER},                  # old / new values: the owner of that family only
    # --- System administrator ---
    "block_user":            {ADMIN},
    "create_reset_link":     {ADMIN},                   # FR-03
}


def can(role, action):
    """True if this role may do this action. Unknown roles and actions are always refused."""
    return role in ALLOWED.get(action, set())


def can_use_account(role, account_id, shared_account_ids):
    """Owner and adult may use any account of their family. A child only the accounts shared with them (BR-10)."""
    if role in (OWNER, ADULT):
        return True
    if role == CHILD:
        return account_id in shared_account_ids
    return False


def can_modify_transaction(role, member_id, created_by):
    """Edit or delete a transaction (BR-11).

    The owner may change any transaction of the family. An adult only their own
    (`created_by` is the member who recorded it). A child and the administrator never.
    """
    if role == OWNER:
        return True
    if role == ADULT:
        return member_id == created_by
    return False
