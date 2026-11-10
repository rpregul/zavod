import { BILLING } from './config.js?v=1.1.1';

export async function billingRequest(action, data = {}, token = null) {
  const response = await fetch(BILLING.endpoint + '/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(data), signal: AbortSignal.timeout(30000), cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'temporarily_unavailable');
    error.status = response.status;
    throw error;
  }
  return result;
}
