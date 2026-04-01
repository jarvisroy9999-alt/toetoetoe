"""
Seed scraper voor Bol.com bestsellers.
Gebruikt Playwright om top-500 producten te seeden zodat de eerste user
al prijshistorie ziet zonder dat de extensie het al heeft gezien.

Gebruik:
    python -m app.scraper.bol_scraper
of via cron:
    0 6 * * * curl -X POST http://localhost:8080/api/v1/internal/run-scraper -H "X-Internal-Key: <key>"
"""
import asyncio
import json
import logging
import re
import sys
from datetime import datetime

import httpx
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Bol.com bestseller category URLs to seed
SEED_URLS = [
    "https://www.bol.com/nl/nl/l/bestsellers-elektronica/N/3728/",
    "https://www.bol.com/nl/nl/l/bestsellers-computers-tablets/N/3728+8299/",
    "https://www.bol.com/nl/nl/l/bestsellers-telefonie/N/3728+7137/",
    "https://www.bol.com/nl/nl/l/bestsellers-speelgoed/N/3728+10210/",
    "https://www.bol.com/nl/nl/l/bestsellers-sport/N/3728+10218/",
    "https://www.bol.com/nl/nl/l/bestsellers-keuken/N/3728+10214/",
]

API_BASE = "http://localhost:8080/api/v1"
SCRAPER_OBSERVER_ID = "seed-scraper-v1"
MAX_PRODUCTS = 500


def extract_bol_id_from_url(url: str) -> str | None:
    """Extract the numeric Bol.com product ID from a product URL."""
    match = re.search(r"/p/[^/]+/(\d+)", url)
    return match.group(1) if match else None


async def extract_price_from_page(page) -> dict | None:
    """Extract product data from a Bol.com product page using JSON-LD."""
    try:
        scripts = await page.query_selector_all('script[type="application/ld+json"]')
        current_url = page.url

        bol_id = extract_bol_id_from_url(current_url)
        if not bol_id:
            return None

        for script in scripts:
            content = await script.text_content()
            try:
                data = json.loads(content)
            except json.JSONDecodeError:
                continue

            if data.get("@type") == "ProductGroup":
                variants = data.get("hasVariant", [])
                # Find variant matching current URL's bolId
                for variant in variants:
                    variant_url = variant.get("url", "")
                    if bol_id in variant_url or not variants:
                        offers = variant.get("offers", {})
                        price = offers.get("price")
                        if price:
                            return {
                                "bol_id": bol_id,
                                "title": data.get("name", variant.get("name", "")),
                                "price": float(price),
                                "url": current_url,
                                "image_url": data.get("image", [None])[0] if isinstance(data.get("image"), list) else data.get("image"),
                                "ean": variant.get("gtin13") or variant.get("gtin"),
                                "seller": offers.get("seller", {}).get("name") if isinstance(offers.get("seller"), dict) else None,
                                "source": "scraper",
                            }
                # Fallback: use first variant with a price
                for variant in variants:
                    offers = variant.get("offers", {})
                    price = offers.get("price")
                    if price:
                        return {
                            "bol_id": bol_id,
                            "title": data.get("name", variant.get("name", "")),
                            "price": float(price),
                            "url": current_url,
                            "image_url": data.get("image", [None])[0] if isinstance(data.get("image"), list) else data.get("image"),
                            "ean": variant.get("gtin13") or variant.get("gtin"),
                            "seller": None,
                            "source": "scraper",
                        }
    except Exception as e:
        log.warning(f"Extract error: {e}")
    return None


async def report_price(client: httpx.AsyncClient, data: dict) -> bool:
    """POST price observation to the backend API."""
    payload = {
        "bol_id": data["bol_id"],
        "price": data["price"],
        "title": data["title"],
        "url": data["url"],
        "image_url": data.get("image_url"),
        "ean": data.get("ean"),
        "seller": data.get("seller"),
        "observer_id": SCRAPER_OBSERVER_ID,
        "source": "scraper",
    }
    try:
        resp = await client.post(f"{API_BASE}/prices/report", json=payload, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        log.warning(f"Report failed for {data['bol_id']}: {e}")
        return False


async def scrape_category(page, category_url: str, client: httpx.AsyncClient, seen: set, max_per_category: int = 100) -> int:
    """Scrape one category listing page and visit each product. Returns count of scraped products."""
    log.info(f"Scraping category: {category_url}")
    count = 0

    try:
        await page.goto(category_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2000)

        # Find product links
        links = await page.eval_on_selector_all(
            'a[data-test="product-title"], a[href*="/nl/nl/p/"]',
            "els => els.map(el => el.href)"
        )

        product_urls = []
        for link in links:
            bid = extract_bol_id_from_url(link)
            if bid and bid not in seen and "/nl/nl/p/" in link:
                seen.add(bid)
                product_urls.append(link)
                if len(product_urls) >= max_per_category:
                    break

        log.info(f"  Found {len(product_urls)} new product URLs")

        for url in product_urls:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(1500)  # polite delay

                data = await extract_price_from_page(page)
                if data:
                    ok = await report_price(client, data)
                    status = "✓" if ok else "✗"
                    log.info(f"  {status} {data['bol_id']} €{data['price']} — {data['title'][:50]}")
                    if ok:
                        count += 1
            except Exception as e:
                log.warning(f"  Error on {url}: {e}")
                continue

    except Exception as e:
        log.error(f"Category error {category_url}: {e}")

    return count


async def run_seed_scraper():
    """Main entry point for the seed scraper."""
    log.info(f"Starting seed scraper at {datetime.utcnow().isoformat()}")
    total = 0
    seen = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale="nl-NL",
            viewport={"width": 1280, "height": 800},
        )
        # Remove webdriver flag
        await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        page = await context.new_page()

        async with httpx.AsyncClient() as client:
            per_category = MAX_PRODUCTS // len(SEED_URLS)
            for url in SEED_URLS:
                if total >= MAX_PRODUCTS:
                    break
                n = await scrape_category(page, url, client, seen, max_per_category=per_category)
                total += n
                log.info(f"Category done. Running total: {total}/{MAX_PRODUCTS}")

        await browser.close()

    log.info(f"Seed scraper finished. Total products seeded: {total}")
    return total


if __name__ == "__main__":
    result = asyncio.run(run_seed_scraper())
    sys.exit(0 if result > 0 else 1)
