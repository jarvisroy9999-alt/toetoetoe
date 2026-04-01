from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import Base, engine
from app.routers import alerts, health, internal, prices, products

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="ToeToeToe API",
    description="Bol.com Price Tracker voor Nederland",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = settings.allowed_origins.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(prices.router, prefix="/api/v1", tags=["prices"])
app.include_router(products.router, prefix="/api/v1", tags=["products"])
app.include_router(alerts.router, prefix="/api/v1", tags=["alerts"])
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(internal.router, prefix="/api/v1", tags=["internal"])
