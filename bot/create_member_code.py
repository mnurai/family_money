"""Make a one-time sign-in code for a family member:

    python -m bot.create_member_code <member_id> ["Display Name"]

The member sends it to the bot in a private chat:  /authorize CODE
Later the website will show this code to the logged-in user; until the backend login
exists, the family Owner / the team creates it here.
"""
import sys

from bot import config
from bot.db import make_session_factory
from bot.models import BotUserProfile
from bot.people import create_member_code
from app.models import FamilyMember


def main() -> None:
    if len(sys.argv) not in (2, 3) or not sys.argv[1].isdigit():
        raise SystemExit('usage: python -m bot.create_member_code <member_id> ["Display Name"]')
    member_id = int(sys.argv[1])
    Session = make_session_factory(config.DATABASE_URL)
    with Session() as db:
        try:
            code = create_member_code(db, member_id)
        except ValueError as exc:
            raise SystemExit(str(exc))
        if len(sys.argv) == 3:
            user_id = db.get(FamilyMember, member_id).user_id
            profile = db.get(BotUserProfile, user_id) or BotUserProfile(user_id=user_id, name="")
            profile.name = sys.argv[2][:80]
            db.add(profile)
            db.commit()
    print(f"Code: {code}  (valid {config.LINK_CODE_MINUTES} min)")
    print(f"In a private chat with the bot, send:  /authorize {code}")


if __name__ == "__main__":
    main()
