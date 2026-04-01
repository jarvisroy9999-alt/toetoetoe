/**
 * bol-extractor.js
 * Extracts product + price data from Bol.com product pages.
 *
 * Primary strategy: JSON-LD (schema.org ProductGroup → hasVariant)
 * Fallback: AggregateOffer lowPrice from JSON-LD
 */

(function () {
  "use strict";

  if (!window.location.pathname.match(/\/p\//)) return;

  // ── Utilities ──────────────────────────────────────────────────────────────

  function safeFloat(value) {
    if (value == null) return null;
    const n = parseFloat(String(value).replace(",", ".").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  function extractBolIdFromUrl(url) {
    const m = (url || window.location.href).match(/\/p\/(?:[^/]+\/)?(\d{6,})\/?$/);
    return m ? m[1] : null;
  }

  // ── Primary: JSON-LD ───────────────────────────────────────────────────────

  function extractFromJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    if (!scripts.length) return null;

    let productGroup = null;
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data["@type"] === "ProductGroup") {
          productGroup = data;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!productGroup) return null;

    const currentUrl = window.location.href;
    const currentBolId = extractBolIdFromUrl(currentUrl);

    // Try to match current URL to a specific variant
    const variants = productGroup.hasVariant || [];
    let matchedVariant = null;

    if (currentBolId) {
      matchedVariant = variants.find((v) => {
        const variantId = extractBolIdFromUrl(v.url || v["@id"] || "");
        return variantId === currentBolId;
      });
    }

    // Fallback: use first variant if no match
    const variant = matchedVariant || variants[0] || null;

    const price =
      safeFloat(variant?.offers?.price) ||
      safeFloat(productGroup?.offers?.lowPrice) ||
      safeFloat(productGroup?.offers?.price);

    if (!price) return null;

    const bolId = currentBolId || extractBolIdFromUrl(variant?.url) || extractBolIdFromUrl(variant?.["@id"]);
    if (!bolId) return null;

    const title =
      variant?.name ||
      productGroup?.name ||
      document.title?.replace(" - bol.com", "").trim() ||
      "";

    const ean =
      variant?.gtin ||
      variant?.gtin13 ||
      variant?.ean ||
      productGroup?.gtin ||
      null;

    const imageUrl =
      (Array.isArray(variant?.image) ? variant.image[0] : variant?.image) ||
      (Array.isArray(productGroup?.image) ? productGroup.image[0] : productGroup?.image) ||
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
      null;

    // Category from BreadcrumbList
    let category = null;
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data["@type"] === "BreadcrumbList") {
          category = data.itemListElement
            ?.map((el) => el.name || el.item?.name)
            .filter(Boolean)
            .join(" > ");
          break;
        }
      } catch { continue; }
    }

    const seller =
      variant?.offers?.seller?.name ||
      variant?.offers?.offeredBy?.name ||
      "bol.com";

    return {
      bolId,
      price,
      title: title.trim(),
      ean: ean ? String(ean) : null,
      imageUrl: typeof imageUrl === "string" ? imageUrl : null,
      category,
      seller,
      url: currentUrl.split("?")[0],
    };
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  function run() {
    const productData = extractFromJsonLd();
    if (!productData) return;

    chrome.runtime.sendMessage({ type: "PRICE_OBSERVED", data: productData });
    chrome.storage.local.set({ currentProduct: productData });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  // SPA navigation support
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (window.location.pathname.match(/\/p\//)) setTimeout(run, 800);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
