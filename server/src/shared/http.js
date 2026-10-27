// Response helpers for the module routes.

export const ok = (res, data) => res.json(data);
export const created = (res, data) => res.status(201).json(data);
