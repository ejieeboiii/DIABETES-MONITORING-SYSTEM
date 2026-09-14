const STORAGE_KEY = 'breathdx_auth_notice';

export function setAuthNotice(type, message) {
  if (!message) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ type, message }));
  } catch {
    // ignore quota / private mode
  }
}

export function consumeAuthNotice() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
