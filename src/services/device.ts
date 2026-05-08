const DEVICE_KEY_STORAGE = 'mindplan_device_key';

export function getDeviceKey(): string {
  const existing = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (existing) return existing;

  const created = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_KEY_STORAGE, created);
  return created;
}

export function clearDeviceKey() {
  localStorage.removeItem(DEVICE_KEY_STORAGE);
}
