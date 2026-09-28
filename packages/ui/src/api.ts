/**
 * The only way a tool talks to its API. Credentials are always included,
 * 401 always means "send the user to SSO", and errors have one shape.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly loginUrl?: string,
  ) {
    super(code);
  }
}

export function createApiClient(baseUrl: string) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; loginUrl?: string };
      throw new ApiError(res.status, body.error ?? `http_${res.status}`, body.loginUrl);
    }
    return (await res.json()) as T;
  }

  return {
    baseUrl,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
    loginUrl: (returnTo: string) => `${baseUrl}/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
