export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NO_ANSWER = 'No answer from the server. Check the link and retry.';
/** Fired when a console request is refused for want of a login, so the console goes back to its password form whichever panel asked. */
export const GM_LOGGED_OUT = 's30:gm-logged-out';

export async function api<T>(path: string, init: { method?: string; json?: unknown; body?: BodyInit; timeoutMs?: number } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  let text: string;
  try {
    res = await fetch(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', signal: abort.signal });
    // The body too: a link that drops halfway through an answer fails here, not as a raw browser error.
    text = await res.text();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError(0, NO_ANSWER);
    throw new ApiError(0, 'Link failed. Check the connection and retry.');
  } finally {
    window.clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    // No JSON error from the game: the reverse proxy's own page while the container restarts (502, 503, 504).
    const msg = (data as { error?: string } | null)?.error ?? (res.status >= 500 ? NO_ANSWER : res.statusText || 'Request failed');
    if (res.status === 401 && path.startsWith('/api/gm/') && path !== '/api/gm/login') window.dispatchEvent(new Event(GM_LOGGED_OUT));
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
