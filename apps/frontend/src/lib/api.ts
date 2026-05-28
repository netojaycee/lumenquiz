// NEXT_PUBLIC_API_URL controls where API calls go:
//   unset       → relative URL "" — dev uses Next.js proxy (/api/* → :3002), prod is same-origin
//   ""          → same as unset (explicit relative)
//   "http://…"  → direct override, e.g. for Electron or LAN device testing
export function getBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  if (envUrl) return envUrl                          // explicit absolute URL only
  if (typeof window === 'undefined') return 'http://localhost:3002'  // SSR fallback
  return ''                                          // browser: relative → proxy in dev, same-origin in prod
}

// Socket.IO can't go through Next.js rewrites (no WebSocket proxy support).
// Always connects directly to the backend; for web hosting NEXT_PUBLIC_API_URL="" signals same-origin.
export function getSocketUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  if (envUrl !== undefined) return envUrl
  if (typeof window === 'undefined') return 'http://localhost:3002'
  return `http://${window.location.hostname}:3002`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}/api${path}`
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  const url = `${getBaseUrl()}/api${path}`
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    // No Content-Type header — browser sets multipart/form-data with boundary automatically
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, formData),
}
