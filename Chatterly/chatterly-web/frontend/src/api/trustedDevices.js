import { requestResult } from './client';

// Story: Sprint 10 | Story 2 — Two-Factor Authentication (2FA) › Trusted Devices.
// Thin wrappers around the (planned) trusted-device endpoints under /api/2fa.
// Like the SMS/email OTP helpers in twoFactor.js, these target routes that are
// NOT part of the documented API yet (docs/api.md §106-110) and have no matching
// backend handler — they will 404 until the backend adds them. `skipGlobalError`
// keeps that from surfacing a toast, and the Trusted Devices modal falls back to
// a locally-managed device list so the UI stays functional in the meantime.

// A trusted device is normalized to a flat shape the modal can render directly.
const normalizeDevice = (device = {}) => ({
  id: String(device.id ?? device._id ?? device.deviceId ?? ''),
  name: device.name || device.deviceName || 'Unknown device',
  os: device.os || device.platform || '',
  browser: device.browser || '',
  location: device.location || '',
  trustedOn: device.trustedOn || device.trustedAt || device.createdAt || '',
  isCurrent: Boolean(device.isCurrent ?? device.current ?? device.thisDevice),
  active: Boolean(device.active ?? device.isActive ?? device.online),
});

// GET /api/2fa/devices — list the account's trusted devices.
export const getTrustedDevices = () =>
  requestResult(
    {
      method: 'get',
      url: '/api/2fa/devices',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to load trusted devices.',
      transform: (payload) => {
        const list = Array.isArray(payload?.devices)
          ? payload.devices
          : Array.isArray(payload)
            ? payload
            : [];
        return list.map(normalizeDevice);
      },
    }
  );

// DELETE /api/2fa/devices/:id — revoke trust for a single device.
export const removeTrustedDevice = (deviceId) =>
  requestResult(
    {
      method: 'delete',
      url: `/api/2fa/devices/${encodeURIComponent(String(deviceId || ''))}`,
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to remove the device.',
    }
  );

// DELETE /api/2fa/devices — revoke trust for every device on the account.
export const removeAllTrustedDevices = () =>
  requestResult(
    {
      method: 'delete',
      url: '/api/2fa/devices',
      skipGlobalError: true,
    },
    {
      fallbackMessage: 'Failed to remove all devices.',
    }
  );
