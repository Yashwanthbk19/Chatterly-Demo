export function callDuration(startedAt?: string | null, serverDuration?: number): number {
  if (typeof serverDuration === 'number' && Number.isFinite(serverDuration) && serverDuration >= 0) {
    return Math.floor(serverDuration);
  }
  const start = startedAt ? Date.parse(startedAt) : NaN;
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;
}

export function formatEndedDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}
