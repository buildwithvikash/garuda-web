// A create the client may send twice (a double click, a retry after a lost answer). With an Idempotency-Key header, a
// repeat of the same key from the same user gets the first request's answer instead of creating a second record.
// Kept in this process's memory for 10 minutes (the server runs as one process). A refused request (4xx / 5xx) is
// forgotten, so the user can correct it and send it again.
const TTL = 10 * 60 * 1000;
const seen = new Map(); // `${user}|${route}|${key}` -> { at, answer: Promise<{ status, body } | null> }

export function idempotent(req, res, next) {
  const key = String(req.get('Idempotency-Key') ?? '').trim();
  if (!key || key.length > 100) return next();
  const now = Date.now();
  for (const [k, v] of seen) if (now - v.at > TTL) seen.delete(k);

  const id = `${req.session?.userCode ?? ''}|${req.baseUrl}${req.path}|${key}`;
  const first = seen.get(id);
  // the same request again: the first one's answer once it has one (or a fresh run if it never answered)
  if (first) return void first.answer.then((a) => (a ? res.status(a.status).json(a.body) : next()));

  let settle;
  seen.set(id, { at: now, answer: new Promise((r) => (settle = r)) });
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) seen.delete(id);
    settle({ status: res.statusCode, body });
    return json(body);
  };
  res.on('close', () => {
    if (!res.writableEnded) seen.delete(id);
    settle(null);
  });
  next();
}

/** for tests: forget every key */
export const _forgetAll = () => seen.clear();
