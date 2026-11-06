"""Tests for the permission matrix (NFR-02, BR-10, BR-13, D-2)."""
from app.services.permissions import can, can_use_account


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


def test_br13_child_cannot_see_family_total():
    assert can("CHILD", "view_family_total") is False


def test_only_owner_can_invite_members():
    assert can("OWNER", "invite_member") is True
    assert can("ADULT", "invite_member") is False
    assert can("CHILD", "invite_member") is False


def test_only_admin_can_block_user():
    assert can("ADMIN", "block_user") is True
    assert can("OWNER", "block_user") is False


def test_unknown_action_and_unknown_role_are_refused():
    assert can("OWNER", "delete_everything") is False
    assert can("STRANGER", "edit_account") is False
    assert can_use_account("STRANGER", 1, {1}) is False
