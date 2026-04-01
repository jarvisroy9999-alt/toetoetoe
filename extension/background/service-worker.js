/**
 * service-worker.js  (Manifest V3 background)
 * Handles price reporting to backend + alert checking.
 */

import { api } from "../lib/api-client.js";
import { getObserverId } from "../lib/storage.js";

// ── Price reporting ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PRICE_OBSERVED") {
    handlePriceObserved(message.data).then(sendResponse).catch((err) => {
      console.warn("[ToeToeToe] price report failed:", err.message);
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async response
  }
});

async function handlePriceObserved(productData) {
  const observerId = await getObserverId();

  const result = await api.reportPrice({
    bol_id:     productData.bolId,
    price:      productData.price,
    title:      productData.title,
    ean:        productData.ean,
    image_url:  productData.imageUrl,
    category:   productData.category,
    seller:     productData.seller,
    url:        productData.url,
    observer_id: observerId,
  });

  // Update badge to reflect price status
  updateBadge(result.price_rank, result.is_new_low);

  return result;
}

// ── Badge ──────────────────────────────────────────────────────────────────

function updateBadge(priceRank, isNewLow) {
  const colors = {
    lowest:    "#22c55e", // groen — laagste ooit
    below_avg: "#86efac", // licht groen
    average:   "#94a3b8", // grijs
    above_avg: "#f97316", // oranje
    highest:   "#ef4444", // rood
  };
  const labels = {
    lowest:    "▼",
    below_avg: "↓",
    average:   "",
    above_avg: "↑",
    highest:   "▲",
  };

  chrome.action.setBadgeBackgroundColor({ color: colors[priceRank] || "#94a3b8" });
  chrome.action.setBadgeText({ text: labels[priceRank] ?? "" });
}

// ── Periodic alert check (every 15 min via alarm) ──────────────────────────

chrome.alarms.create("checkAlerts", { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "checkAlerts") return;
  await checkAlerts();
});

async function checkAlerts() {
  const observerId = await getObserverId();
  let alerts;
  try {
    alerts = await api.listAlerts(observerId);
  } catch {
    return; // silently skip if offline
  }

  for (const alert of alerts) {
    if (!alert.is_active) continue;
    if (!alert.current_price) continue;
    if (alert.current_price <= alert.target_price) {
      await notifyPriceDrop(alert);
    }
  }
}

async function notifyPriceDrop(alert) {
  chrome.notifications.create(`alert_${alert.id}`, {
    type:    "basic",
    iconUrl: "../icons/icon48.png",
    title:   "ToeToeToe – Prijs gedaald! 🎉",
    message: `${alert.title}\nNu: €${alert.current_price.toFixed(2)} (alert: €${alert.target_price.toFixed(2)})`,
    priority: 2,
  });
}

// Add notifications permission usage if available
// (declared in manifest — not yet, add in phase 3 when polishing)
