/**
 * bol-extractor.js
 * Extracts product + price data from Bol.com product pages.
 *
 * Primary strategy: parse __NEXT_DATA__ JSON (stable, structured)
 * Fallback strategy: DOM selectors (fragile, but covers edge cases)
 */

(function () {
  "use strict";

  // Don't run on search pages or non-product pages
  if (!window.location.pathname.match(/\/p\//)) return;

  // ── Utilities ──────────────────────────────────────────────────────────────

  function safeFloat(value) {
    if (value == null) return null;
    const n = parseFloat(String(value).replace(",", ".").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  function extractBolId() {
    // URL pattern: /nl/nl/p/title/BOLID/ or /nl/p/BOLID/
    const m = window.location.pathname.match(/\/p\/(?:[^/]+\/)?(\d{10,})/);
    return m ? m[1] : null;
  }

  // ── Primary: __NEXT_DATA__ ──────────────────────────────────────────────────

  function extractFromNextData() {
    const scriptEl = document.getElementById("__NEXT_DATA__");
    if (!scriptEl) return null;

    let data;
    try {
      data = JSON.parse(scriptEl.textContent);
    } catch {
      return null;
    }

    // Navigate the Next.js page props tree
    // Bol.com nests product data under: props.pageProps.productPage or similar
    const pageProps =
      data?.props?.pageProps ||
      data?.props?.initialProps?.pageProps ||
      {};

    // Try multiple known paths — Bol.com occasionally restructures this
    const product =
      pageProps?.productPage?.product ||
      pageProps?.product ||
      pageProps?.pdpData?.product ||
      null;

    if (!product) return null;

    // Price can be in multiple locations
    const priceData =
      product?.offerData?.offers?.[0] ||
      product?.offers?.[0] ||
      product?.price ||
      null;

    const price =
      safeFloat(priceData?.priceWithoutReduction) ||
      safeFloat(priceData?.price) ||
      safeFloat(priceData?.regularPrice) ||
      safeFloat(product?.price) ||
      extractPriceFromDOM(); // final fallback

    if (!price) return null;

    const bolId =
      String(product?.id || product?.productId || extractBolId() || "");
    if (!bolId) return null;

    const title =
      product?.title ||
      product?.name ||
      document.title?.replace(" - bol.com", "").trim() ||
      "";

    const ean =
      product?.ean ||
      product?.gtin ||
      priceData?.ean ||
      null;

    const imageUrl =
      product?.images?.[0]?.url ||
      product?.image?.url ||
      product?.media?.[0]?.url ||
      null;

    const category =
      product?.categoryPath?.map((c) => c.name)?.join(" > ") ||
      product?.category?.name ||
      null;

    const seller =
      priceData?.seller?.displayName ||
      priceData?.sellerDisplayName ||
      "bol.com";

    return {
      bolId,
      price,
      title: title.trim(),
      ean: ean ? String(ean) : null,
      imageUrl,
      category,
      seller,
      url: window.location.href.split("?")[0], // strip query params
    };
  }

  // ── Fallback: DOM selectors ─────────────────────────────────────────────────

  function extractPriceFromDOM() {
    // Try common Bol.com price selectors (fragile — update when needed)
    const selectors = [
      '[data-test="price"]',
      ".promo-price",
      ".buy-block__price",
      '[class*="price--"]',
      'meta[property="product:price:amount"]',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = el.tagName === "META" ? el.getAttribute("content") : el.textContent;
      const price = safeFloat(raw);
      if (price && price > 0 && price < 100000) return price;
    }
    return null;
  }

  function extractFromDOM() {
    const price = extractPriceFromDOM();
    if (!price) return null;

    const bolId = extractBolId();
    if (!bolId) return null;

    const title =
      document.querySelector('h1[data-test="title"]')?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title?.replace(" - bol.com", "").trim() ||
      "";

    const imageUrl =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
      null;

    return {
      bolId,
      price,
      title,
      ean: null,
      imageUrl,
      category: null,
      seller: "bol.com",
      url: window.location.href.split("?")[0],
    };
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  function extract() {
    return extractFromNextData() || extractFromDOM();
  }

  // Run extraction and send to service worker
  function run() {
    const productData = extract();
    if (!productData) return;

    // Send to background service worker
    chrome.runtime.sendMessage({
      type: "PRICE_OBSERVED",
      data: productData,
    });

    // Also store in chrome.storage for popup access
    chrome.storage.session.set({ currentProduct: productData });
  }

  // Wait for DOM + possible SPA navigation
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  // Handle Bol.com SPA navigation (they use client-side routing)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (window.location.pathname.match(/\/p\//)) {
        // Small delay to let Next.js update __NEXT_DATA__
        setTimeout(run, 800);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
