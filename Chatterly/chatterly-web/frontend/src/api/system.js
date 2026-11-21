// System/infra API client — backend health probe.
//
// GET /health checks that the backend is up. It never throws: it resolves to
// { ok, status } so callers can branch on `ok` without a try/catch. The backend
// currently replies with a plain string ("API is running....") while the
// documented shape is { status: "OK" } — both are handled.

import { requestPayload } from './client';

export const healthCheck = async () => {
  try {
    const payload = await requestPayload(
      { method: 'get', url: '/api/health', skipGlobalError: true },
      { fallbackMessage: 'Health check failed.' }
    );

    const status =
      (payload && typeof payload === 'object' ? payload.status : '') ||
      (typeof payload === 'string' ? payload : '') ||
      'OK';

    return { ok: true, status, raw: payload };
  } catch (error) {
    return { ok: false, status: '', error: error?.message || 'Health check failed.' };
  }
};
