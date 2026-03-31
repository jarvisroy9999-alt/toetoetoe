/**
 * popup.js
 * PrijsRadar popup controller.
 * Fetches price history from backend and renders chart + stats.
 */

import { api } from "../lib/api-client.js";
import { getObserverId, getCurrentProduct, getCachedHistory, setCachedHistory } from "../lib/storage.js";
import { BOL_PARTNER_ID } from "../lib/config.js";

// ── State ──────────────────────────────────────────────────────────────────

let currentProduct = null;
let historyData = null;
let selectedDays = 90;

// ── Boot ───────────────────────────────────────────────────────────────────

async function init() {
  showState("loading");

  currentProduct = await getCurrentProduct();
  if (!currentProduct) {
    showState("no-product");
    return;
  }

  renderProductHeader();
  showState("product");

  await loadHistory(selectedDays);
  setupTabListeners();
  setupAlertListener();
  setupBuyButton();
}

// ── UI helpers ─────────────────────────────────────────────────────────────

function showState(name) {
  document.getElementById("state-loading").classList.add("hidden");
  document.getElementById("state-no-product").classList.add("hidden");
  document.getElementById("state-product").classList.add("hidden");
  document.getElementById(`state-${name}`)?.classList.remove("hidden");
}

function fmt(price) {
  if (price == null) return "–";
  return "€\u00a0" + price.toFixed(2).replace(".", ",");
}

function renderProductHeader() {
  document.getElementById("product-title").textContent = currentProduct.title;

  const img = document.getElementById("product-image");
  if (currentProduct.imageUrl) {
    img.src = currentProduct.imageUrl;
    img.classList.remove("hidden");
    img.onerror = () => img.classList.add("hidden");
  }

  document.getElementById("price-current").textContent = fmt(currentProduct.price);
}

function renderPriceStats(history) {
  document.getElementById("price-current").textContent = fmt(history.current_price ?? currentProduct.price);
  document.getElementById("price-lowest").textContent  = fmt(history.lowest_price);
  document.getElementById("price-highest").textContent = fmt(history.highest_price);

  // Pre-fill alert with current price as suggestion
  const alertInput = document.getElementById("alert-price");
  if (!alertInput.value && history.current_price) {
    alertInput.value = (history.current_price * 0.9).toFixed(2); // 10% below
  }
}

function renderRankBadge(history) {
  const badge = document.getElementById("price-rank-badge");
  if (!history.current_price || !history.lowest_price) {
    badge.classList.add("hidden");
    return;
  }

  const diff = history.current_price - history.lowest_price;
  const range = (history.highest_price ?? history.current_price) - history.lowest_price;
  const ratio = range > 0 ? diff / range : 0;

  let rank, label;
  if (ratio === 0)     { rank = "lowest";    label = "🏆 Laagste prijs ooit!"; }
  else if (ratio < 0.25) { rank = "below_avg"; label = "✅ Onder gemiddeld"; }
  else if (ratio < 0.75) { rank = "average";   label = "➖ Gemiddelde prijs"; }
  else if (ratio < 1.0)  { rank = "above_avg"; label = "⚠️ Boven gemiddeld"; }
  else                   { rank = "highest";   label = "🔴 Hoogste prijs ooit"; }

  badge.className = `rank-badge rank-${rank}`;
  badge.textContent = label;
  badge.classList.remove("hidden");
}

// ── Price chart (pure SVG/Canvas, no external lib) ─────────────────────────

function renderChart(prices) {
  const canvas  = document.getElementById("price-chart");
  const noData  = document.getElementById("chart-no-data");

  if (!prices || prices.length === 0) {
    canvas.classList.add("hidden");
    noData.classList.remove("hidden");
    return;
  }

  canvas.classList.remove("hidden");
  noData.classList.add("hidden");

  const ctx = canvas.getContext("2d");
  const W   = canvas.offsetWidth  || 312;
  const H   = canvas.offsetHeight || 100;
  canvas.width  = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const vals     = prices.map((p) => p.min_price);
  const minPrice = Math.min(...vals);
  const maxPrice = Math.max(...vals);
  const range    = maxPrice - minPrice || 1;
  const pad      = { top: 12, bottom: 18, left: 42, right: 8 };

  const toX = (i) => pad.left + (i / (prices.length - 1 || 1)) * (W - pad.left - pad.right);
  const toY = (v) => pad.top + (1 - (v - minPrice) / range) * (H - pad.top - pad.bottom);

  // Grid lines (3)
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth   = 0.5;
  for (let i = 0; i < 3; i++) {
    const y = pad.top + (i / 2) * (H - pad.top - pad.bottom);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const v = maxPrice - (i / 2) * range;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("€" + v.toFixed(0), pad.left - 3, y + 3);
  }

  // Line path
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = toX(i), y = toY(p.min_price);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  // Fill gradient
  const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
  grad.addColorStop(0, "rgba(0, 98, 204, 0.25)");
  grad.addColorStop(1, "rgba(0, 98, 204, 0)");

  ctx.save();
  ctx.lineTo(toX(prices.length - 1), H - pad.bottom);
  ctx.lineTo(toX(0), H - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Stroke line
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = toX(i), y = toY(p.min_price);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#0062cc";
  ctx.lineWidth   = 2;
  ctx.lineJoin    = "round";
  ctx.stroke();

  // Lowest price dot
  const minIdx  = vals.indexOf(minPrice);
  ctx.beginPath();
  ctx.arc(toX(minIdx), toY(minPrice), 4, 0, Math.PI * 2);
  ctx.fillStyle = "#16a34a";
  ctx.fill();
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadHistory(days) {
  const cached = await getCachedHistory(currentProduct.bolId + "_" + days);
  if (cached) {
    historyData = cached;
    renderPriceStats(historyData);
    renderRankBadge(historyData);
    renderChart(historyData.prices);
    return;
  }

  try {
    const data = await api.getHistory(currentProduct.bolId, days);
    historyData = data;
    await setCachedHistory(currentProduct.bolId + "_" + days, data);
    renderPriceStats(historyData);
    renderRankBadge(historyData);
    renderChart(historyData.prices);
  } catch {
    // Backend unreachable — show what we have from content script
    renderChart(null);
  }
}

// ── Tab switching ──────────────────────────────────────────────────────────

function setupTabListeners() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedDays = parseInt(btn.dataset.days, 10);
      await loadHistory(selectedDays);
    });
  });
}

// ── Alert ──────────────────────────────────────────────────────────────────

function setupAlertListener() {
  document.getElementById("alert-btn").addEventListener("click", async () => {
    const input = document.getElementById("alert-price");
    const target = parseFloat(input.value);
    if (!target || target <= 0) return;

    const statusEl = document.getElementById("alert-status");
    statusEl.className = "alert-status";
    statusEl.textContent = "";

    try {
      const observerId = await getObserverId();
      await api.createAlert({
        bol_id:      currentProduct.bolId,
        target_price: target,
        observer_id:  observerId,
      });
      statusEl.textContent = `✅ Alert ingesteld voor €${target.toFixed(2).replace(".", ",")}`;
      statusEl.classList.remove("hidden");
    } catch (err) {
      statusEl.className = "alert-status error";
      statusEl.textContent = "❌ Kon alert niet instellen. Probeer opnieuw.";
      statusEl.classList.remove("hidden");
    }
  });
}

// ── Affiliate buy button ───────────────────────────────────────────────────

function setupBuyButton() {
  const btn = document.getElementById("buy-btn");
  const baseUrl = currentProduct.url || `https://www.bol.com/nl/nl/p/-/${currentProduct.bolId}/`;
  const affiliateUrl = BOL_PARTNER_ID
    ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}partner_id=${BOL_PARTNER_ID}`
    : baseUrl;
  btn.href = affiliateUrl;
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
