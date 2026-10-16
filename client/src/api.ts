export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
  try {
    res = await fetch(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', signal: abort.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new ApiError(0, 'No answer from the server. Check the link and retry.');
    throw new ApiError(0, 'Link failed. Check the connection and retry.');
  } finally {
    window.clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? res.statusText ?? 'Request failed';
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
