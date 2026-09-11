/**
 * Server-side API request class
 * Used in Server Components for calling the backend while forwarding cookies
 */
import { cookies, headers as getHeaders } from 'next/headers'
import { buildQueryString } from '@ts-shared/utils/query-string'
import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'
import { buildWorkerSecretHeader } from '../worker-secret'
import { safeFeatureFlagCookiePart } from '@/lib/feature-flags/shared'
import { buildWebClientInfoHeaders } from './client-info'
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}
interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}
export class ServerRequest {
  /**
   * Make an API request
   * Server requests use absolute URLs and forward auth/personalization cookies when available
   *
   * @throws {Error} if called from client-side code (use the client helpers instead)
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    if (typeof window !== 'undefined') {
      /* c8 ignore next 5 -- defensive guard: Node test environment never defines window */
      throw new TypeError(
        `ServerRequest cannot be used in client components. ` +
          `Use the client helpers from '@/lib/api/client' instead. ` +
          `Endpoint: ${endpoint}`,
      )
    }
    const { method = 'GET', body, headers = {} } = options
    const url = `${this.getBaseUrl()}${endpoint}`
    const [cookieHeader, requestIdHeader, forwardedIpHeaders] = await Promise.all([
      buildCookieHeader(headers),
      buildRequestIdHeader(),
      buildForwardedIpHeaders(),
    ])
    const hasCookieAuth = hasHeader(headers, 'cookie') || hasHeader(cookieHeader, 'cookie')
    const originHeader: Record<string, string> =
      method === 'GET' || !hasCookieAuth ? {} : { Origin: new URL(url).origin }
    const fetchOptions: RequestInit = {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...requestIdHeader,
        ...headers,
        ...forwardedIpHeaders,
        ...buildWebClientInfoHeaders(),
        ...buildWorkerSecretHeader(),
        ...cookieHeader,
        ...originHeader,
      },
    }
    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }
    try {
      const response = await fetch(url, fetchOptions)
      if (!response.ok) {
        throw await createApiError(response)
      }
      if (response.status === 204) {
        return undefined as T
      }
      const data = await response.json()
      return data as T
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError(
        `${error instanceof Error ? error.message : 'Unknown error'} (${method} ${url})`,
        500,
        error,
      )
    }
  }
  async get<T>(endpoint: string, options: GetOptions = {}): Promise<T> {
    const queryString = options.searchParams ? buildQueryString(options.searchParams) : ''
    return this.request<T>(`${endpoint}${queryString}`, { headers: options.headers ?? {} })
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body,
      ...options,
    })
  }

  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body,
      ...options,
    })
  }

  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body,
      ...options,
    })
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    })
  }

  private getBaseUrl(): string {
    return (
      process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2900'
    )
  }
}

async function buildCookieHeader(headers: Record<string, string>): Promise<Record<string, string>> {
  if (hasCookieHeader(headers)) {
    return {}
  }

  try {
    const cookieStore = await cookies()
    const dt = cookieStore.get('dt')
    const st = cookieStore.get('st')
    const ffPart = safeFeatureFlagCookiePart(cookieStore.get('ff')?.value)
    const cookieParts: string[] = []

    if (dt?.value) cookieParts.push(`dt=${dt.value}`)
    if (st?.value) cookieParts.push(`st=${st.value}`)
    if (ffPart) cookieParts.push(ffPart)

    if (cookieParts.length === 0) {
      return {}
    }

    return {
      Cookie: cookieParts.join('; '),
    }
  } catch {
    return {}
  }
}

async function buildRequestIdHeader(): Promise<Record<string, string>> {
  try {
    const h = await getHeaders()
    const id = h.get('x-request-id')
    return id ? { 'x-request-id': id } : {}
  } catch {
    return {}
  }
}

async function buildForwardedIpHeaders(): Promise<Record<string, string>> {
  try {
    const headers = await getHeaders()
    const forwardedFor = headers.get('x-forwarded-for')
    const connectingIp = headers.get('cf-connecting-ip')
    return {
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...(connectingIp ? { 'cf-connecting-ip': connectingIp } : {}),
    }
  } catch {
    return {}
  }
}

async function createApiError(response: Response): Promise<ApiError> {
  const errorData = await parseErrorResponseBody(response)
  return new ApiError(`API request failed: ${response.statusText}`, response.status, errorData)
}

function hasCookieHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(headerName => headerName.toLowerCase() === 'cookie')
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const normalizedName = name.toLowerCase()
  return Object.keys(headers).some(headerName => headerName.toLowerCase() === normalizedName)
}
