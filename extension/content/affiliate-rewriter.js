/**
 * affiliate-rewriter.js
 * Rewrites Bol.com product links to include the partner affiliate tag.
 * Runs on bol.com product pages as a content script.
 *
 * This is the primary revenue mechanism — every click on the buy button
 * in the popup or on the page goes through our partner link.
 */

(function () {
  "use strict";

  // Partner ID is baked in at build time via config injection.
  // For development it reads from storage; for production use manifest replacement.
  const PARTNER_PARAM = "partner_id";

  chrome.storage.local.get("bolPartnerId", ({ bolPartnerId }) => {
    if (!bolPartnerId) return; // no partner ID configured yet
    injectPartnerTag(bolPartnerId);
  });

  function injectPartnerTag(partnerId) {
    // Rewrite all bol.com product links on the page
    document.querySelectorAll('a[href*="bol.com"]').forEach((a) => {
      rewriteLink(a, partnerId);
    });

    // Watch for dynamically added links (recommendations, related products)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          node.querySelectorAll?.('a[href*="bol.com"]').forEach((a) => {
            rewriteLink(a, partnerId);
          });
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function rewriteLink(anchor, partnerId) {
    if (anchor.dataset.prRewritten) return; // already done
    try {
      const url = new URL(anchor.href);
      if (!url.hostname.endsWith("bol.com")) return;
      if (!url.pathname.match(/\/(p|nl)\//)) return; // only product links
      url.searchParams.set(PARTNER_PARAM, partnerId);
      anchor.href = url.toString();
      anchor.dataset.prRewritten = "1";
    } catch {
      // Malformed URL — skip
    }
  }
})();
