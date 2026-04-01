/**
 * price-badge.js
 * Injects a small "Bekijk prijshistorie" badge on Bol.com product pages.
 * Clicking it opens the extension popup.
 * Also shows a minimal price indicator (laagste ooit) directly on the page.
 */

(function () {
  "use strict";

  // Wait for the product to be detected by bol-extractor.js
  // (which fires PRICE_OBSERVED and sets currentProduct in session storage)
  setTimeout(injectBadge, 1200);

  function injectBadge() {
    // Don't duplicate
    if (document.getElementById("pr-badge")) return;

    // Find the price element to anchor next to
    const priceEl =
      document.querySelector('[data-test="price"]') ||
      document.querySelector(".promo-price") ||
      document.querySelector(".buy-block__price");

    if (!priceEl) return;

    chrome.storage.session.get("currentProduct", ({ currentProduct }) => {
      if (!currentProduct) return;

      const badge = document.createElement("div");
      badge.id = "pr-badge";
      badge.innerHTML = `
        <span class="pr-radar-icon">📡</span>
        <span class="pr-text">Prijshistorie bekijken</span>
      `;
      badge.setAttribute("title", "ToeToeToe – bekijk de volledige prijshistorie");

      // Styling (scoped with pr- prefix to avoid conflicts)
      const style = document.createElement("style");
      style.textContent = `
        #pr-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 6px;
          padding: 4px 10px 4px 8px;
          background: #e8f0fe;
          border: 1px solid #0062cc33;
          border-radius: 99px;
          cursor: pointer;
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #0062cc;
          font-weight: 600;
          transition: background 0.15s;
          user-select: none;
        }
        #pr-badge:hover { background: #d1e3ff; }
        .pr-radar-icon { font-size: 13px; }
      `;
      document.head.appendChild(style);

      // Insert after price element
      priceEl.parentElement.insertBefore(badge, priceEl.nextSibling);

      // Clicking opens the extension popup (not possible directly in MV3,
      // but we can scroll to top + show a visual hint that the icon is there)
      badge.addEventListener("click", () => {
        badge.innerHTML = `<span class="pr-radar-icon">📡</span><span class="pr-text">Klik op het extensie-icoon ↗</span>`;
        setTimeout(() => {
          badge.innerHTML = `<span class="pr-radar-icon">📡</span><span class="pr-text">Prijshistorie bekijken</span>`;
        }, 2500);
      });
    });
  }
})();
