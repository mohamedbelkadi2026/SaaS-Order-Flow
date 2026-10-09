/**
 * Coalesce identical in-flight read requests without serving stale data.
 * Entries are removed on both success and failure. This is intentionally
 * process-local: it reduces simultaneous dashboard DB bursts without needing
 * Redis or cross-instance cache invalidation.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const pending = Promise.resolve().then(fetcher);
  inFlight.set(key, pending);
  void pending.then(
    () => { if (inFlight.get(key) === pending) inFlight.delete(key); },
    () => { if (inFlight.get(key) === pending) inFlight.delete(key); },
  );
  return pending;
}
