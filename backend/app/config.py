from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///data/toetoetoe.db"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    bol_partner_id: str = ""
    api_key: str = ""
    allowed_origins: str = "*"

    # Rate limiting
    rate_limit_per_minute: int = 60

    # Price validation
    max_price_deviation: float = 0.5  # 50% max deviation from last known price

    model_config = {"env_file": ".env"}


settings = Settings()
