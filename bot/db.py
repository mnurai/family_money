from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base
from bot.models import create_tables


def make_session_factory(database_url: str):
    engine = create_engine(database_url, pool_pre_ping=True)
    if engine.dialect.name == "sqlite":
        # Local test database: create the whole schema so the bot runs out of the box.
        Base.metadata.create_all(engine)
    else:
        # Real database: the app's tables come from the migrations; add only the bot's.
        create_tables(engine)
    return sessionmaker(engine, expire_on_commit=False)
