/** Helpers usable from both server and client components. */
export const toStr = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Minutes since the engine's last heartbeat (epoch ms in System). */
export const heartbeatAgeMin = (hb: unknown, now = Date.now()) => Math.floor((now - Number(hb || 0)) / 60000);

/** Request time for server components (keeps render functions free of direct Date.now calls). */
export const nowMs = () => Date.now();
