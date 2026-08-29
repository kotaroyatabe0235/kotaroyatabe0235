// Client-side key-value storage backed by the app's own /api/kv route + SQLite,
// mirroring the shape of the sandboxed `window.storage` API this app was ported from.
export const storage = {
  async get(key) {
    const res = await fetch(`/api/kv/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`storage.get failed: ${res.status}`);
    return res.json(); // { value: string|null }
  },
  async set(key, value) {
    const res = await fetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    return res.ok;
  },
};
