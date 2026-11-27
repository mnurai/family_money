"""Create a one-time link code:  python -m bot.create_link_code <family_id>

Give the code ONLY to a family Owner or Adult: the alerts show amounts and account names,
and a Child must not see family totals (BR-13). Later this should become an API endpoint
that checks the caller's role with permissions.can(role, "view_family_reports").
"""
import sys

from bot import config
from bot.db import make_session_factory
from bot.linking import create_link_code


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        raise SystemExit("usage: python -m bot.create_link_code <family_id>")
    Session = make_session_factory(config.DATABASE_URL)
    with Session() as db:
        code = create_link_code(db, int(sys.argv[1]))
    print(f"Code: {code}  (valid {config.LINK_CODE_MINUTES} min)")
    print(f"In Telegram, send to the bot:  /link {code}")


if __name__ == "__main__":
    main()
