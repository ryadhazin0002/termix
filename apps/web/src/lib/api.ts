import { useAuthStore } from '@/store/auth'

export function getBackendUrl(): string {
  if (typeof window !== 'undefined' && window?.location?.hostname) {
    const configured = process.env.NEXT_PUBLIC_BACKEND_URL
    if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
      return configured
    }
    const currentHost = window.location.hostname
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      const protocol = window.location.protocol || 'http:'
      return `${protocol}//${currentHost}:3001`
    }
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
}

type TokenGetter = (forceRefresh?: boolean) => Promise<string | null>
let tokenGetter: TokenGetter | null = null

export function setTokenProvider(getter: TokenGetter) {
  tokenGetter = getter
}

async function request<T>(path: string, options: RequestInit, token?: string, retryOn401 = true): Promise<T> {
  const BASE = getBackendUrl()
  let activeToken = token
  if (!activeToken && tokenGetter) {
    try {
      activeToken = (await tokenGetter(false)) || undefined
    } catch {
      // ignore
    }
  }
  if (!activeToken) {
    activeToken = useAuthStore.getState().token || undefined
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
    })
  } catch (netErr: any) {
    throw new Error(`Cannot reach Termix backend at ${BASE}. Ensure 'pnpm dev' is running.`)
  }

  // Auto-refresh token and retry on 401
  if (res.status === 401 && retryOn401 && tokenGetter) {
    try {
      const freshToken = await tokenGetter(true)
      if (freshToken) {
        return request<T>(path, options, freshToken, false)
      }
    } catch {
      // retry failed, proceed to error parsing
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? err.message ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { method: 'GET' }, token),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }, token),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: 'DELETE' }, token),
}
