import httpx

from app.config import settings


TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


async def send_telegram_message(chat_id: str, text: str) -> bool:
    """Send a message via Telegram bot. Returns True on success."""
    if not settings.telegram_bot_token:
        return False

    url = TELEGRAM_API.format(token=settings.telegram_bot_token)
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            return resp.status_code == 200
    except Exception:
        return False


def format_price_alert(title: str, target_price: float, current_price: float, url: str, partner_id: str = "") -> str:
    """Format a price drop alert message."""
    if partner_id:
        # Append affiliate partner tag
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}partner={partner_id}"

    return (
        f"🔔 <b>Prijsalert ToeToeToe!</b>\n\n"
        f"<b>{title}</b>\n\n"
        f"✅ Huidige prijs: <b>€{current_price:.2f}</b>\n"
        f"🎯 Jouw doelprijs: €{target_price:.2f}\n\n"
        f"<a href=\"{url}\">Bekijk op Bol.com →</a>"
    )
