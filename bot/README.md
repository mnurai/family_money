# Telegram bot

## What it does

**Menu (private chat, `/panel`):** four buttons

| Button | What happens |
|---|---|
| 💸 TRANSFER | pick From account → To account → amount (or `/transfer 22 23 75000`) → confirm. Owner and Adult only (BR-10). |
| 💰 CHECK BALANCE | balances of your accounts. A Child sees only shared accounts and no total (BR-10, BR-13). |
| 🔐 AUTHORIZE | sign in as a family member with a one-time code: `/authorize CODE`. `/logout` signs out. |
| ℹ️ INFO | family members and their roles (the Owner also sees who uses Telegram). |

**Alerts (a linked chat gets them):** a transaction over 50 000 ₸, an account below 10 000 ₸.
Settings: `/alerts` (pause, limits), `/big 75000`, `/low 15000`, `/link CODE`, `/stop`.

**Website:** the owner's **Telegram** page shows everything the bot did (transfers, sign-ins,
balance checks, alerts), refreshed every 5 seconds.

Money and member screens work only in a **private chat** with the bot. In a group everybody would read them.
All rules come from the existing code (`record_transaction`, `permissions.can`); the bot never edits a balance itself.

## Setup

1. **@BotFather** → `/newbot` → copy the token.
2. `.env` in the project root (never commit it): see `.env.example`
   (`TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `BOT_API_KEY`, limits).
3. `pip install -r requirements.txt`
4. Demo data that matches the website's demo family:
   ```
   python -m bot.demo                 # family 5 (Seitkali), members 6-8, accounts 22-26
   python -m bot.demo codes           # sign-in codes for Aigerim (Owner), Daulet (Adult), Aidar (Child)
   python -m bot.create_link_code 5   # alert code for a chat
   ```
   If you used an older `fbt_bot.db` (family 1), delete that file first: it only holds demo data.
5. Run the bot:  `python -m bot.main`
6. Run the website bridge (second terminal):  `uvicorn bot.web:app --port 8001`
7. Website: copy `frontend/.env.example` to `frontend/.env.local`, set the same key, then
   `cd frontend && npm run dev`. Log in as **aigerim@mail.kz** (password `demo1234`) → **Telegram** in the menu.

In Telegram: `/authorize CODE` in a private chat, press the buttons. Make a transfer and watch it appear on the website.

## Limits you should know

- The website still runs on its **in-browser demo data** (no backend yet). The bot works on the **database**.
  The Telegram page shows what the bot did; a bot transfer does **not** change the balances the
  website's own screens show. That needs the website switched to the real API (`frontend/src/api/index.ts`).
- The bridge is protected only by a shared key that sits in browser code. Demo-grade: replace it with the real
  login/role check (NFR-02, NFR-03) when the backend login exists.
- Sign-in codes are made with `python -m bot.create_member_code <member_id>`. When the backend has login, the
  website should show the code to the logged-in user.
- The display names come from the stand-in table `bot_user_profiles` until a real users table exists.

## For the team

- 8 small tables in `bot/models.py` need migrations (**Gulnaz**): telegram_links, telegram_link_codes,
  telegram_low_balance_alerts, telegram_settings, telegram_users, telegram_member_codes, telegram_activity,
  bot_user_profiles.
- Tests: `python -m pytest tests/test_bot_alerts.py tests/test_bot_panel.py tests/test_bot_menu.py`
