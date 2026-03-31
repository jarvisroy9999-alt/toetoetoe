/**
 * storage.js
 * Chrome storage helpers + anonymous observer ID management.
 */

export async function getObserverId() {
  const { observerId } = await chrome.storage.local.get("observerId");
  if (observerId) return observerId;

  // Generate a random UUID on first install
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ observerId: id });
  return id;
}

export async function getCurrentProduct() {
  const { currentProduct } = await chrome.storage.session.get("currentProduct");
  return currentProduct || null;
}

export async function getCachedHistory(bolId) {
  const key = `history_${bolId}`;
  const { [key]: cached } = await chrome.storage.session.get(key);
  if (!cached) return null;
  // Cache valid for 10 minutes
  if (Date.now() - cached.ts > 10 * 60 * 1000) return null;
  return cached.data;
}

export async function setCachedHistory(bolId, data) {
  const key = `history_${bolId}`;
  await chrome.storage.session.set({ [key]: { data, ts: Date.now() } });
}
