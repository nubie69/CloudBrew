import { API_BASE_URLS, API_URL } from './config';

let authToken = '';
const REQUEST_TIMEOUT_MS = 2500;

function normalizeErrorMessage(payload, fallback = 'Request failed.') {
  if (!payload) {
    return fallback;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

function createRequestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function setAuthToken(token) {
  authToken = token || '';
}

export function clearAuthToken() {
  authToken = '';
}

function isNetworkFailure(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('network request failed') || message.includes('failed to fetch');
}

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const requestUrls = API_BASE_URLS.length > 0 ? API_BASE_URLS : [API_URL];
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (authToken) {
    mergedHeaders.Authorization = `Bearer ${authToken}`;
  }

  let response;
  let responseUrl = '';
  let lastNetworkError = null;

  for (const baseUrl of requestUrls) {
    const targetUrl = `${baseUrl}${path}`;

    if (__DEV__) {
      console.log('[API REQUEST]', { method, targetUrl });
    }

    try {
      response = await fetch(targetUrl, {
        ...options,
        headers: mergedHeaders,
      });

      responseUrl = targetUrl;
      break;
    } catch (error) {
      if (!isNetworkFailure(error)) {
        throw error;
      }

      lastNetworkError = error;
      if (__DEV__) {
        console.log('[API NETWORK ERROR]', {
          method,
          targetUrl,
          timeoutMs: REQUEST_TIMEOUT_MS,
          message: error.message,
        });
      }
    }
  }

  if (!response) {
    throw lastNetworkError || new Error('Network request failed.');
  }

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = text;
    }
  }

  if (__DEV__) {
    console.log('[API RESPONSE]', {
      method,
      responseUrl,
      status: response.status,
      ok: response.ok,
    });
  }

  if (!response.ok) {
    throw createRequestError(normalizeErrorMessage(payload), response.status);
  }

  return payload;
}

export function getApiUrl() {
  return API_BASE_URLS.length > 0 ? API_BASE_URLS[0] : API_URL;
}
