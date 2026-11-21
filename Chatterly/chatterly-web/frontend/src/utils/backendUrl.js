// backendUrl.js  — only 2 functions change, everything else stays identical

const DEFAULT_BACKEND_PORT = '5000';

const stripTrailingSlash = (value = '') => String(value || '').trim().replace(/\/+$/, '');

const stripApiSuffix = (value = '') =>
  stripTrailingSlash(value).replace(/\/api(?:\/.*)?$/i, '');

const looksLikeHost = (value = '') => /^[\w.-]+(?::\d+)?(?:\/.*)?$/i.test(String(value || '').trim());

const toAbsoluteUrl = (value = '') => {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) return '';
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmedValue)) return trimmedValue;
  if (looksLikeHost(trimmedValue) && !trimmedValue.startsWith('/')) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    return `${protocol}//${trimmedValue}`;
  }
  return trimmedValue;
};

// ✅ FIX 1: only inject :5000 when the host is localhost
const isLocalhost = (hostname = '') =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const normalizeConfiguredUrl = (value = '') => {
  const absoluteUrl = toAbsoluteUrl(value);
  if (!absoluteUrl) return '';

  try {
    const baseOrigin =
      typeof window !== 'undefined'
        ? window.location.origin
        : `http://localhost:${DEFAULT_BACKEND_PORT}`;
    const parsedUrl = new URL(absoluteUrl, baseOrigin);

    // In local Vite development, keep browser traffic on the frontend origin
    // and let Vite's /api and /socket.io proxies reach the backend. This avoids
    // direct-port network/CORS failures and produces a normal HTTP error when
    // the local API is still starting instead of Axios's opaque "Network Error".
    if (
      typeof window !== 'undefined' &&
      window.location.port === '5173' &&
      isLocalhost(window.location.hostname) &&
      isLocalhost(parsedUrl.hostname) &&
      parsedUrl.port === DEFAULT_BACKEND_PORT
    ) {
      return stripTrailingSlash(window.location.origin);
    }

    // A localhost URL baked into a frontend opened through a LAN hostname
    // points at the visitor's device. During Vite development, keep the backend
    // port but use the same hostname as the page (for example
    // 192.168.1.20:5173 -> 192.168.1.20:5000). Deployed pages use their origin
    // and are expected to route /api and /socket.io through the reverse proxy.
    if (
      typeof window !== 'undefined' &&
      isLocalhost(parsedUrl.hostname) &&
      !isLocalhost(window.location.hostname)
    ) {
      const isDevFrontend = ['4173', '5173'].includes(window.location.port);
      if (isDevFrontend) {
        parsedUrl.hostname = window.location.hostname;
      } else {
        return stripTrailingSlash(window.location.origin);
      }
    }

    // ✅ Was: always forced :5000 — broke production URLs on standard ports (80/443)
    // ✅ Now: only inject default port on localhost
    if (
      !parsedUrl.port &&
      ['http:', 'https:'].includes(parsedUrl.protocol) &&
      isLocalhost(parsedUrl.hostname)
    ) {
      parsedUrl.port = DEFAULT_BACKEND_PORT;
    }

    return stripTrailingSlash(parsedUrl.toString());
  } catch {
    return stripTrailingSlash(absoluteUrl);
  }
};

// ✅ FIX 2: only append :5000 on localhost — not on production hostnames
const getDefaultBackendOrigin = () => {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    // ✅ Was: always appended :5000, producing e.g. https://myapp.com:5000 in prod
    // ✅ Now: production uses same origin (reverse proxy routes to backend);
    //         localhost explicitly targets the backend dev server port
    return isLocalhost(hostname)
      ? `${protocol}//${hostname}:${DEFAULT_BACKEND_PORT}`
      : `${protocol}//${hostname}`;
  }
  return `http://localhost:${DEFAULT_BACKEND_PORT}`;
};

export const resolveApiBaseUrl = (configuredValue = import.meta.env.VITE_API_BASE_URL || '') => {
  const normalizedConfiguredUrl = normalizeConfiguredUrl(stripApiSuffix(configuredValue));
  return normalizedConfiguredUrl || getDefaultBackendOrigin();
};

export const resolveSocketBaseUrl = (
  configuredSocketUrl = import.meta.env.VITE_SOCKET_URL || '',
  configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
) => {
  const normalizedSocketUrl = normalizeConfiguredUrl(configuredSocketUrl);
  if (normalizedSocketUrl) return normalizedSocketUrl;
  return resolveApiBaseUrl(configuredApiBaseUrl);
};
