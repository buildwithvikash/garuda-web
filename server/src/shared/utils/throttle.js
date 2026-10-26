// Failed sign-in attempts per key (user ID and client address) in a sliding window. After `max` failures the key is
// refused until its oldest failure leaves the window; a success clears it.
// ponytail: in memory, per server process: a restart clears it, and several processes would each count on their own.
// Move the counts to the database if the app ever runs on more than one process.

export function throttle({ max = 10, windowMs = 15 * 60_000, now = () => Date.now() } = {}) {
  const fails = new Map(); // key -> failure times, oldest first
  const recent = (key) => {
    const t = (fails.get(key) ?? []).filter((x) => x > now() - windowMs);
    if (t.length) fails.set(key, t);
    else fails.delete(key);
    return t;
  };
  return {
    /** milliseconds until the key may try again (0: allowed) */
    retryIn(key) {
      const t = recent(key);
      return t.length >= max ? t[0] + windowMs - now() : 0;
    },
    fail(key) {
      fails.set(key, [...recent(key), now()]);
    },
    clear(key) {
      fails.delete(key);
    },
  };
}
