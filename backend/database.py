from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SQLite database file — stored in your backend folder
SQLALCHEMY_DATABASE_URL = "sqlite:///./diabetes_monitoring.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Required for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency — used in every route to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()