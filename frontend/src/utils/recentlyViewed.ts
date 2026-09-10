const KEY = "invexa-recently-viewed";
const MAX_ITEMS = 8;

export function getRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentlyViewed(ticker: string) {
  if (typeof window === "undefined" || !ticker) return;
  try {
    const existing = getRecentlyViewed().filter((t) => t !== ticker);
    const updated = [ticker, ...existing].slice(0, MAX_ITEMS);
    window.localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable (e.g. private browsing) — silently skip tracking.
  }
}
