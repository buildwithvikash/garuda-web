// Thin fetch wrapper: JSON in/out, cookies included, 401 -> login.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Any 401 (session missing or expired) goes to login, like Layout.Master's redirect. Login calls never return 401.
  if (res.status === 401 && window.location.pathname !== '/login') {
    window.location.assign('/login');
    return new Promise(() => {});
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `Request failed (${res.status})`);
  return data;
}
