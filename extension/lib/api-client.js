/**
 * api-client.js
 * Thin wrapper around the ToeToeToe backend API.
 * Used by both the service worker and popup.
 */

import { API_BASE } from "./config.js";

async function apiRequest(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

export const api = {
  reportPrice: (data) => apiRequest("POST", "/prices/report", data),
  getProduct:  (bolId) => apiRequest("GET",  `/products/${bolId}`),
  getHistory:  (bolId, days = 90) => apiRequest("GET", `/products/${bolId}/history?days=${days}`),
  createAlert: (data) => apiRequest("POST", "/alerts", data),
  listAlerts:  (observerId) => apiRequest("GET", `/alerts?observer_id=${observerId}`),
  deleteAlert: (alertId, observerId) =>
    apiRequest("DELETE", `/alerts/${alertId}?observer_id=${observerId}`),
};
