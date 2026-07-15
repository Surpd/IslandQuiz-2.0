import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    games = relationship("Game", back_populates="owner")
    ratings = relationship("Rating", back_populates="user")
    results = relationship("QuizResult", back_populates="user")


class Game(Base):
    __tablename__ = "games"

    id = Column(String, primary_key=True)
    kind = Column(String, nullable=False)  # quiz, jeopardy, millionaire
    data = Column(JSON, nullable=False)    # весь объект игры
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    owner_name = Column(String, nullable=True)
    visibility = Column(String, default="private")  # public, private, link
    forked_from = Column(String, nullable=True)
    forked_owner_name = Column(String, nullable=True)
    tags = Column(JSON, nullable=True)  # string[]
    ratings_data = Column(JSON, nullable=True)  # {userId: rating}
    play_count = Column(Integer, default=0)
    show_answers = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="games")
    ratings = relationship("Rating", back_populates="game", cascade="all, delete-orphan")


class Rating(Base):
    __tablename__ = "ratings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String, ForeignKey("games.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    value = Column(Integer, nullable=False)  # 1-5
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    game = relationship("Game", back_populates="ratings")
    user = relationship("User", back_populates="ratings")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id = Column(String, primary_key=True)
    game_id = Column(String, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    player_name = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    score = Column(Integer, default=0)
    max_score = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    total_questions = Column(Integer, default=0)
    time_sec = Column(Integer, default=0)
    finished_at = Column(DateTime, default=datetime.datetime.utcnow)
    answers = Column(JSON, nullable=True)  # массив ответов

    user = relationship("User", back_populates="results")


class JeopardyResult(Base):
    __tablename__ = "jeopardy_results"

    id = Column(String, primary_key=True)
    game_id = Column(String, nullable=False)
    played_at = Column(DateTime, default=datetime.datetime.utcnow)
    teams = Column(JSON, nullable=False)  # массив команд
    winner_id = Column(String, nullable=True)
    has_final = Column(Boolean, default=False)


class MillionaireResult(Base):
    __tablename__ = "millionaire_results"

    id = Column(String, primary_key=True)
    game_id = Column(String, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    player_name = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    outcome = Column(String, nullable=False)  # won, lost
    won_amount = Column(Float, default=0)
    guaranteed_amount = Column(Float, default=0)
    reached_count = Column(Integer, default=0)
    total_questions = Column(Integer, default=0)
    time_sec = Column(Integer, default=0)
    finished_at = Column(DateTime, default=datetime.datetime.utcnow)
    answers = Column(JSON, nullable=True)


class OnlineQuizResult(Base):
    __tablename__ = "online_quiz_results"

    id = Column(String, primary_key=True)
    game_id = Column(String, nullable=False)
    room_code = Column(String, nullable=False)
    played_at = Column(DateTime, default=datetime.datetime.utcnow)
    duration_sec = Column(Integer, default=0)
    players = Column(JSON, nullable=False)  # массив игроков с ответами