// Empty string = same-origin (Caddy proxies /api, /auth, /ws to the server container).
// Set VITE_API_URL only for non-standard dev setups where server runs on a different origin.
const API_BASE = (import.meta as ImportMeta & { env: Record<string, string> }).env['VITE_API_URL'] ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      res.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? 'Error inesperado',
    );
  }

  return res.json() as Promise<T>;
}
