-- Полный скрипт базы данных family_db для PostgreSQL

-- Создание пользовательских ENUM-типов
CREATE TYPE user_role AS ENUM ('OWNER', 'ADULT', 'CHILD');
CREATE TYPE account_type AS ENUM ('CASH', 'BANK_CARD', 'SAVINGS', 'CREDIT_CARD');
CREATE TYPE category_type AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE rule_frequency AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE trans_type AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');
CREATE TYPE goal_status AS ENUM ('ACTIVE', 'ACHIEVED', 'CANCELLED');
CREATE TYPE invite_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
CREATE TYPE notif_type AS ENUM ('BUDGET_80', 'BUDGET_100', 'INVITE_ACCEPTED', 'INVITE_DECLINED', 'RECURRING_CREATED', 'RECURRING_SKIPPED', 'GOAL_ACHIEVED');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'BLOCK', 'UNBLOCK');

-- 1. Таблица пользователей (USERS)
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system_admin BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_count SMALLINT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP NULL,
    reset_token_hash VARCHAR(255) NULL,
    reset_token_expires_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL
);

-- 2. Таблица семей (FAMILIES)
CREATE TABLE families (
    family_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    base_currency CHAR(3) NOT NULL DEFAULT 'KZT',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Связь пользователя с семьей (FAMILY_MEMBERS)
CREATE TABLE family_members (
    member_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    user_id INT NOT NULL UNIQUE,
    role user_role NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TIMESTAMP NULL,
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 4. Счета (ACCOUNTS)
CREATE TABLE accounts (
    account_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    name VARCHAR(60) NOT NULL,
    type account_type NOT NULL,
    opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    current_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    credit_limit DECIMAL(14,2) NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_family_account_name UNIQUE (family_id, name),
    CONSTRAINT chk_credit_limit CHECK (credit_limit IS NULL OR credit_limit >= 0),
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES family_members(member_id)
);

-- 5. Доступ детей к счетам (ACCOUNT_ACCESS)
CREATE TABLE account_access (
    account_id INT NOT NULL,
    member_id INT NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (account_id, member_id),
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES family_members(member_id) ON DELETE CASCADE
);

-- 6. Категории (CATEGORIES)
CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    family_id INT NULL,
    parent_id INT NULL,
    name VARCHAR(60) NOT NULL,
    type category_type NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES categories(category_id) ON DELETE SET NULL
);

-- 7. Регулярные правила (RECURRING_RULES)
CREATE TABLE recurring_rules (
    rule_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    type trans_type NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    source_account_id INT NULL,
    destination_account_id INT NULL,
    category_id INT NULL,
    description VARCHAR(255) NULL,
    frequency rule_frequency NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    next_run_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INT NOT NULL,
    CONSTRAINT chk_recurring_amount CHECK (amount > 0),
    CONSTRAINT chk_recurring_end_date CHECK (end_date IS NULL OR end_date >= start_date),
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (source_account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (destination_account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (created_by) REFERENCES family_members(member_id)
);

-- 8. Транзакции (TRANSACTIONS)
CREATE TABLE transactions (
    transaction_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    type trans_type NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    source_account_id INT NULL,
    destination_account_id INT NULL,
    category_id INT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(255) NULL,
    created_by INT NOT NULL,
    recurring_rule_id INT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_transaction_logic CHECK (
      (type = 'INCOME'   AND source_account_id IS NULL     AND destination_account_id IS NOT NULL AND category_id IS NOT NULL) OR
      (type = 'EXPENSE'  AND source_account_id IS NOT NULL AND destination_account_id IS NULL     AND category_id IS NOT NULL) OR
      (type = 'TRANSFER' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL
                         AND source_account_id <> destination_account_id AND category_id IS NULL)
    ),
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (source_account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (destination_account_id) REFERENCES accounts(account_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (created_by) REFERENCES family_members(member_id),
    FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules(rule_id)
);

-- Индексы для транзакций
CREATE INDEX idx_trans_family_date ON transactions(family_id, transaction_date);
CREATE INDEX idx_trans_source ON transactions(source_account_id);
CREATE INDEX idx_trans_dest ON transactions(destination_account_id);
CREATE INDEX idx_trans_category ON transactions(category_id, transaction_date);

-- 9. Бюджеты (BUDGETS)
CREATE TABLE budgets (
    budget_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    category_id INT NOT NULL,
    period_month DATE NOT NULL,
    limit_amount DECIMAL(14,2) NOT NULL,
    alert_80_sent BOOLEAN NOT NULL DEFAULT FALSE,
    alert_100_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_by INT NOT NULL,
    CONSTRAINT chk_limit_positive CHECK (limit_amount > 0),
    CONSTRAINT uq_family_category_month UNIQUE (family_id, category_id, period_month),
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (created_by) REFERENCES family_members(member_id)
);

-- 10. Цели накопления (SAVINGS_GOALS)
CREATE TABLE savings_goals (
    goal_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    account_id INT NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    target_amount DECIMAL(14,2) NOT NULL,
    target_date DATE NULL,
    status goal_status NOT NULL DEFAULT 'ACTIVE',
    created_by INT NOT NULL,
    CONSTRAINT chk_target_positive CHECK (target_amount > 0),
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES family_members(member_id)
);

-- 11. Приглашения (INVITATIONS)
CREATE TABLE invitations (
    invitation_id SERIAL PRIMARY KEY,
    family_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    invited_by INT NOT NULL,
    status invite_status NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES family_members(member_id)
);

-- 12. Уведомления (NOTIFICATIONS)
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    member_id INT NOT NULL,
    type notif_type NOT NULL,
    message VARCHAR(255) NOT NULL,
    related_entity VARCHAR(30) NULL,
    related_id INT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES family_members(member_id) ON DELETE CASCADE
);

-- 13. Аудит-лог (AUDIT_LOGS)
CREATE TABLE audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    family_id INT NULL,
    actor_user_id INT NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id INT NOT NULL,
    action audit_action NOT NULL,
    old_value JSONB NULL,
    new_value JSONB NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(family_id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
);

-- НАЧАЛЬНЫЕ (SEED) ДАННЫЕ
INSERT INTO users (user_id, email, password_hash, full_name, is_active) 
VALUES (1, 'john.smith@family.com', '$2y$10$abcdefghijklmnopqrstuv', 'John Smith', TRUE);

INSERT INTO families (family_id, name, base_currency) 
VALUES (1, 'Smith family', 'KZT');

INSERT INTO family_members (member_id, family_id, user_id, role) 
VALUES (1, 1, 1, 'OWNER');

INSERT INTO categories (category_id, family_id, parent_id, name, type) VALUES
(1, NULL, NULL, 'Salary', 'INCOME'),
(2, NULL, NULL, 'Food', 'EXPENSE'),
(3, NULL, NULL, 'Refunds', 'INCOME');

INSERT INTO accounts (account_id, family_id, name, type, opening_balance, current_balance, created_by) VALUES
(1, 1, 'Bank card', 'BANK_CARD', 200000.00, 385000.00, 1),
(2, 1, 'Cash', 'CASH', 10000.00, 25000.00, 1),
(3, 1, 'Savings', 'SAVINGS', 0.00, 100000.00, 1);

INSERT INTO budgets (budget_id, family_id, category_id, period_month, limit_amount, created_by) 
VALUES (1, 1, 2, '2026-11-01', 60000.00, 1);

INSERT INTO transactions (transaction_id, family_id, type, amount, source_account_id, destination_account_id, category_id, transaction_date, description, created_by) VALUES
(1, 1, 'INCOME',   350000.00, NULL, 1, 1, '2026-11-01', 'Salary', 1),
(2, 1, 'TRANSFER',  20000.00,    1, 2, NULL, '2026-11-02', 'Transfer to cash', 1),
(3, 1, 'EXPENSE',   45000.00,    1, NULL, 2, '2026-11-03', 'Food from card', 1),
(4, 1, 'EXPENSE',    5000.00,    2, NULL, 2, '2026-11-04', 'Food from Cash', 1),
(5, 1, 'TRANSFER', 100000.00,    1, 3, NULL, '2026-11-05', 'Savings transfer', 1);