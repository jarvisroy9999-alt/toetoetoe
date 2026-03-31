from datetime import date, datetime

from pydantic import BaseModel, Field


# --- Price Report ---

class PriceReportRequest(BaseModel):
    bol_id: str
    price: float = Field(gt=0)
    title: str
    ean: str | None = None
    image_url: str | None = None
    category: str | None = None
    seller: str | None = None
    url: str
    observer_id: str


class PriceReportResponse(BaseModel):
    product_id: int
    is_new_low: bool
    price_rank: str  # lowest, below_avg, average, above_avg, highest


# --- Product ---

class ProductResponse(BaseModel):
    bol_id: str
    title: str
    url: str
    image_url: str | None
    current_price: float | None
    lowest_price: float | None
    highest_price: float | None
    first_seen: datetime
    price_count: int

    model_config = {"from_attributes": True}


class DailyPricePoint(BaseModel):
    date: date
    min_price: float
    max_price: float
    avg_price: float

    model_config = {"from_attributes": True}


class PriceHistoryResponse(BaseModel):
    bol_id: str
    title: str
    current_price: float | None
    lowest_price: float | None
    highest_price: float | None
    prices: list[DailyPricePoint]


# --- Alerts ---

class AlertCreateRequest(BaseModel):
    bol_id: str
    target_price: float = Field(gt=0)
    observer_id: str
    telegram_chat: str | None = None


class AlertResponse(BaseModel):
    id: int
    bol_id: str
    title: str
    target_price: float
    current_price: float | None
    is_active: bool
    created_at: datetime
    triggered_at: datetime | None


# --- Health ---

class HealthResponse(BaseModel):
    status: str
    products_count: int
    observations_today: int
