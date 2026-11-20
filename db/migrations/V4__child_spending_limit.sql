-- Monthly spending limit that a parent sets for a child (one row per child).
-- Apply after V3__align_with_data_dictionary.sql. No row means the child has no limit.
-- The application checks that the member is a CHILD before saving a limit.

CREATE TABLE child_spending_limits (
    member_id     INTEGER       PRIMARY KEY,
    monthly_limit NUMERIC(14,2) NOT NULL CHECK (monthly_limit > 0),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    FOREIGN KEY (member_id) REFERENCES family_members(member_id) ON DELETE CASCADE
);

CREATE TRIGGER trg_child_spending_limits_updated_at
BEFORE UPDATE ON child_spending_limits
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();