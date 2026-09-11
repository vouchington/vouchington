'use client'

/**
 * Client-side API request class
 * Used in Client Components for calling Next.js proxy
 */

import { buildQueryString } from '@ts-shared/utils/query-string'
import { ApiError } from '../error'
import { parseErrorResponseBody } from '../error-helpers'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export class ClientRequest {
  /**
   * Make an API request
   * Browser requests use relative URLs and credentials are automatically included
   *
   * @throws {Error} if called from server-side code (use the server API clients instead)
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    // Runtime assertion: ClientRequest should only be used in client components
    if (typeof window === 'undefined') {
      /* c8 ignore next 5 -- defensive guard: Vitest/JSDOM always defines window; only fires in real SSR */
      throw new TypeError(
        `ClientRequest cannot be used in server components. ` +
          `Use the server helpers from '@/lib/api/server' instead. ` +
          `Endpoint: ${endpoint}`,
      )
    }

    const { method = 'GET', body, headers = {}, signal } = options

    // Use relative URL via Next.js proxy (browser only)
    const url = endpoint

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      // Include credentials (cookies) for same-origin requests
      credentials: 'include',
      signal,
    }

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    try {
      const response = await fetch(url, fetchOptions)

      if (!response.ok) {
        const errorData = await parseErrorResponseBody(response)

        const isAdmissionInProgress =
          response.status === 409 && isErrorCode(errorData, 'CONTRIBUTION_ADMISSION_IN_PROGRESS')
        if (response.status === 429 || isAdmissionInProgress) {
          const retryAfter = response.headers.get('Retry-After')
          const parsed = retryAfter ? parseInt(retryAfter, 10) : NaN
          const retrySeconds = !isNaN(parsed) && parsed > 0 ? parsed : undefined
          const rateLimitData =
            typeof errorData === 'object' && errorData !== null && !Array.isArray(errorData)
              ? { ...errorData, retry_after: retrySeconds }
              : { retry_after: retrySeconds }
          throw new ApiError(
            `API request failed: ${response.statusText}`,
            response.status,
            rateLimitData,
          )
        }

        throw new ApiError(`API request failed: ${response.statusText}`, response.status, errorData)
      }

      // Handle empty successful responses, including 200 endpoints that
      // intentionally return no body.
      const text = await response.text()
      if (!text.trim()) {
        return undefined as T
      }

      return JSON.parse(text) as T
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      // Let AbortError propagate unchanged — it's a client cancellation, not an API error.
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      throw new ApiError(
        `${error instanceof Error ? error.message : 'Unknown error'} (${method} ${url})`,
        500,
        error,
      )
    }
  }

  get<T>(
    endpoint: string,
    options?: {
      searchParams?: Record<string, string | number | boolean | undefined>
      signal?: AbortSignal
    },
  ): Promise<T> {
    const queryString = options?.searchParams ? buildQueryString(options.searchParams) : ''
    return this.request<T>(`${endpoint}${queryString}`, { signal: options?.signal })
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body,
      ...options,
    })
  }

  put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body,
      ...options,
    })
  }

  patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body,
      ...options,
    })
  }

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    })
  }
}

function isErrorCode(errorData: unknown, code: string): boolean {
  return (
    typeof errorData === 'object' &&
    errorData !== null &&
    !Array.isArray(errorData) &&
    (errorData as { code?: unknown }).code === code
  )
}
