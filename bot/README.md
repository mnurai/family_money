# Telegram alert bot

Sends a linked chat two kinds of alerts:

- 💸 a **transaction larger than 50 000 ₸** (income, expense or transfer; transfers are labelled "not spending")
- ⚠️ an **account below 10 000 ₸** (cash and bank cards; one alert, re-armed when the balance recovers)

Both limits are settings in `.env`. No new Python packages are needed (standard library + the project's SQLAlchemy).

## Setup

1. In Telegram open **@BotFather**, send `/newbot`, choose a name, copy the token.
2. `cp .env.example .env`, paste the token (set `DATABASE_URL` to the project's PostgreSQL).
3. Create a link code for a family (give it only to an Owner or Adult, BR-13):
   `python -m bot.create_link_code 1`
4. Start the bot: `python -m bot.main`
5. In Telegram open your bot (or add it to the family group) and send `/link CODE`.

Commands: `/link CODE`, `/stop`, `/help`.

## Try it without the rest of the app

```
python -m bot.demo          # creates family 1 with two accounts (SQLite)
python -m bot.create_link_code 1
python -m bot.main          # in a second terminal; then /link CODE in Telegram
python -m bot.demo big      # -> big-transaction alert
python -m bot.demo low      # -> low-balance alert
```

## For the team

- The bot reads the same tables as the app and uses `format_money` (NFR-20).
- It adds 3 small tables (`bot/models.py`): **Gulnaz must add them to the migrations**.
- Run tests: `python -m pytest tests/test_bot_alerts.py`
