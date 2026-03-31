from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    bol_id = Column(String, unique=True, nullable=False, index=True)
    ean = Column(String, nullable=True)
    title = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    category = Column(String, nullable=True)
    url = Column(String, nullable=False)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    current_price = Column(Float, nullable=True)
    lowest_price = Column(Float, nullable=True)
    highest_price = Column(Float, nullable=True)
    price_count = Column(Integer, default=0)

    observations = relationship("PriceObservation", back_populates="product")
    alerts = relationship("Alert", back_populates="product")
    daily_prices = relationship("DailyPrice", back_populates="product")


class PriceObservation(Base):
    __tablename__ = "price_observations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    price = Column(Float, nullable=False)
    seller = Column(String, nullable=True)
    source = Column(String, default="extension")  # 'extension' or 'scraper'
    observer_id = Column(String, nullable=True)
    observed_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="observations")

    __table_args__ = (
        Index("idx_product_time", "product_id", "observed_at"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    observer_id = Column(String, nullable=False)
    target_price = Column(Float, nullable=False)
    telegram_chat = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    triggered_at = Column(DateTime, nullable=True)

    product = relationship("Product", back_populates="alerts")


class DailyPrice(Base):
    __tablename__ = "daily_prices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    date = Column(Date, nullable=False)
    min_price = Column(Float)
    max_price = Column(Float)
    avg_price = Column(Float)
    observation_count = Column(Integer, default=0)

    product = relationship("Product", back_populates="daily_prices")

    __table_args__ = (
        UniqueConstraint("product_id", "date", name="uq_product_date"),
        Index("idx_product_date", "product_id", "date"),
    )
