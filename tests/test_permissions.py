"""Tests for the permission matrix (NFR-02, BR-10, BR-11, BR-13, BR-17, D-2)."""
from app.services.permissions import ALLOWED, can, can_modify_transaction, can_use_account


# --- Transactions: BR-10, BR-11 ---

def test_br10_child_cannot_record_transfer():
    assert can("CHILD", "record_transfer") is False


def test_owner_and_adult_can_record_transfer():
    assert can("OWNER", "record_transfer") is True
    assert can("ADULT", "record_transfer") is True


def test_br10_child_can_record_income_and_expense():
    assert can("CHILD", "record_income_expense") is True


def test_br10_child_cannot_use_unshared_account():
    assert can_use_account("CHILD", account_id=5, shared_account_ids={1, 2}) is False


def test_br10_child_can_use_shared_account():
    assert can_use_account("CHILD", account_id=1, shared_account_ids={1, 2}) is True


def test_br11_owner_can_modify_any_transaction():
    assert can_modify_transaction("OWNER", member_id=1, created_by=7) is True


def test_br11_adult_can_modify_own_transaction():
    assert can_modify_transaction("ADULT", member_id=2, created_by=2) is True


def test_br11_adult_cannot_modify_foreign_transaction():
    assert can_modify_transaction("ADULT", member_id=2, created_by=1) is False


def test_br11_child_and_admin_cannot_modify_transactions():
    assert can_modify_transaction("CHILD", member_id=3, created_by=3) is False
    assert can_modify_transaction("ADMIN", member_id=9, created_by=9) is False


def test_br11_unknown_role_cannot_modify_transactions():
    assert can_modify_transaction("STRANGER", member_id=1, created_by=1) is False
    assert can_modify_transaction(None, member_id=1, created_by=1) is False


# --- Family and members ---

def test_br17_only_user_without_family_can_create_family():
    assert can(None, "create_family") is True
    for role in ("OWNER", "ADULT", "CHILD", "ADMIN"):
        assert can(role, "create_family") is False


def test_only_owner_manages_members():
    for action in ("invite_member", "remove_member", "change_member_role", "transfer_ownership"):
        assert can("OWNER", action) is True
        assert can("ADULT", action) is False
        assert can("CHILD", action) is False
        assert can("ADMIN", action) is False


# --- Accounts ---

def test_adult_can_create_and_edit_account_but_not_archive_or_share():
    assert can("ADULT", "create_account") is True
    assert can("ADULT", "edit_account") is True
    assert can("ADULT", "archive_account") is False
    assert can("ADULT", "share_account") is False


def test_child_cannot_create_or_edit_account():
    assert can("CHILD", "create_account") is False
    assert can("CHILD", "edit_account") is False


def test_child_can_view_accounts_but_admin_cannot():
    assert can("CHILD", "view_accounts") is True
    assert can("ADMIN", "view_accounts") is False


# --- Categories, recurring rules, budgets, goals ---

def test_child_cannot_manage_planning_items():
    for action in ("manage_categories", "manage_recurring_rules", "manage_budgets", "manage_goals"):
        assert can("OWNER", action) is True
        assert can("ADULT", action) is True
        assert can("CHILD", action) is False
        assert can("ADMIN", action) is False


# --- Reports: BR-13, D-2 ---

def test_br13_child_cannot_see_family_total_or_family_reports():
    assert can("CHILD", "view_family_total") is False
    assert can("CHILD", "view_family_reports") is False


def test_child_can_view_own_reports_but_admin_cannot():
    assert can("CHILD", "view_reports") is True
    assert can("ADMIN", "view_reports") is False


def test_only_owner_and_adult_can_export_csv():
    assert can("OWNER", "export_csv") is True
    assert can("ADULT", "export_csv") is True
    assert can("CHILD", "export_csv") is False


# --- Audit log and administrator ---

def test_audit_log_owner_sees_details_admin_sees_metadata_only():
    assert can("OWNER", "view_audit_log") is True
    assert can("OWNER", "view_audit_log_details") is True
    assert can("ADMIN", "view_audit_log") is True
    assert can("ADMIN", "view_audit_log_details") is False


def test_adult_and_child_cannot_view_audit_log():
    assert can("ADULT", "view_audit_log") is False
    assert can("CHILD", "view_audit_log") is False


def test_only_admin_can_block_user_and_create_reset_link():
    for action in ("block_user", "create_reset_link"):
        assert can("ADMIN", action) is True
        assert can("OWNER", action) is False
        assert can("ADULT", action) is False
        assert can("CHILD", action) is False


# --- Safety ---

def test_unknown_action_and_unknown_role_are_refused():
    assert can("OWNER", "delete_everything") is False
    assert can("STRANGER", "edit_account") is False
    assert can(None, "edit_account") is False
    assert can_use_account("STRANGER", 1, {1}) is False


def test_every_action_is_allowed_for_at_least_one_role():
    assert all(roles for roles in ALLOWED.values())
