BEGIN;

-- 1. Rename audit table to match the data dictionary and the backend model
ALTER TABLE audit_logs RENAME TO audit_log;
ALTER SEQUENCE IF EXISTS audit_logs_log_id_seq RENAME TO audit_log_log_id_seq;
ALTER INDEX IF EXISTS audit_logs_pkey RENAME TO audit_log_pkey;

-- 2. users: email is stored lower-case
ALTER TABLE users
    ADD CONSTRAINT chk_user_email_lowercase CHECK (email = lower(email));

-- 3. family_members: at most one active OWNER per family (BR-18)
CREATE UNIQUE INDEX uq_family_one_owner
    ON family_members (family_id)
    WHERE role = 'OWNER' AND removed_at IS NULL;

-- 4. accounts: opening balance >= 0 except credit cards; credit limit only for credit cards (BR-08)
ALTER TABLE accounts
    ADD CONSTRAINT chk_opening_balance CHECK (type = 'CREDIT_CARD' OR opening_balance >= 0);
ALTER TABLE accounts
    ADD CONSTRAINT chk_credit_limit_type CHECK (credit_limit IS NULL OR type = 'CREDIT_CARD');

-- 5. recurring_rules: same account/category rules as transactions
ALTER TABLE recurring_rules
    ADD CONSTRAINT chk_recurring_logic CHECK (
      (type = 'INCOME'   AND source_account_id IS NULL     AND destination_account_id IS NOT NULL AND category_id IS NOT NULL) OR
      (type = 'EXPENSE'  AND source_account_id IS NOT NULL AND destination_account_id IS NULL     AND category_id IS NOT NULL) OR
      (type = 'TRANSFER' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL
                         AND source_account_id <> destination_account_id AND category_id IS NULL)
    );

-- 6. budgets: period_month must be the first day of a month
ALTER TABLE budgets
    ADD CONSTRAINT chk_budget_first_day CHECK (EXTRACT(DAY FROM period_month) = 1);

-- 7. savings_challenges (FR-46, added in dictionary v1.3)
CREATE TABLE savings_challenges (
    challenge_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    child_member_id INT NOT NULL,
    account_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    target_amount NUMERIC(14,2) NOT NULL,
    target_date DATE NULL,
    status goal_status NOT NULL DEFAULT 'ACTIVE',
    created_by INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    achieved_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_challenge_target_positive CHECK (target_amount > 0),
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (child_member_id) REFERENCES family_members(member_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (created_by) REFERENCES family_members(member_id)
);

-- A child can have only one ACTIVE challenge at a time
CREATE UNIQUE INDEX uq_active_challenge_per_child
    ON savings_challenges (child_member_id)
    WHERE status = 'ACTIVE';

COMMIT;