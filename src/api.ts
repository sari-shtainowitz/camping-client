// Thin fetch wrapper around the Camping API.
//   * stores / retrieves the JWT (requirement 1)
//   * attaches it as `Authorization: Bearer <token>` on every request (requirement 1)
//   * turns any non-2xx response into an ApiError that carries the HTTP status,
//     so callers can branch on 409 (requirement 4)

const TOKEN_KEY = 'camping.jwt'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage unavailable (private mode etc.) - the session just won't persist
  }
}

/** Expiry time (ms since epoch) of the stored JWT, read from its `exp` claim. */
export function tokenExpiresAt(): number | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(payload)) as { exp?: number }
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, title: string, detail: string) {
    super(detail || title)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail || title
  }
}

type ProblemLike = {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
  error?: string
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`/api${path}`, { ...options, headers })

  const raw = res.status === 204 ? '' : await res.text()
  const body: unknown = raw ? JSON.parse(raw) : null

  if (!res.ok) {
    const p = (body ?? {}) as ProblemLike
    const validation = p.errors ? Object.values(p.errors).flat().join(' ') : undefined
    const detail = p.detail ?? validation ?? p.error ?? res.statusText
    throw new ApiError(res.status, p.title ?? `HTTP ${res.status}`, detail)
  }

  return body as T
}
