-- Move each id counter past the ids inserted by the V1 seed data, so new rows get fresh ids instead of colliding with existing ones.
SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users));
SELECT setval(pg_get_serial_sequence('families', 'family_id'), (SELECT MAX(family_id) FROM families));
SELECT setval(pg_get_serial_sequence('family_members', 'member_id'), (SELECT MAX(member_id) FROM family_members));
SELECT setval(pg_get_serial_sequence('categories', 'category_id'), (SELECT MAX(category_id) FROM categories));
SELECT setval(pg_get_serial_sequence('accounts', 'account_id'), (SELECT MAX(account_id) FROM accounts));
SELECT setval(pg_get_serial_sequence('budgets', 'budget_id'), (SELECT MAX(budget_id) FROM budgets));
SELECT setval(pg_get_serial_sequence('transactions', 'transaction_id'), (SELECT MAX(transaction_id) FROM transactions));