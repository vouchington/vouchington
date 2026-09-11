/**
 * Shared API error class used by both server and client
 */

export class ApiError extends Error {
  status: number
  code?: string
  requestId?: string
  data?: unknown
  digest?: string

  constructor(message: string, status: number, data?: unknown) {
    const dataRecord =
      data && typeof data === 'object' && !(data instanceof Error)
        ? (data as Record<string, unknown>)
        : null

    const backendMessage =
      dataRecord && typeof dataRecord.message === 'string' ? dataRecord.message : message

    super(backendMessage)
    this.name = 'ApiError'
    this.status = status
    this.data = data

    // Use Next.js's native HTTP access fallback digest for 401/403/404 so the
    // framework's error handler silences them without any monkey-patching.
    // Other 4xx (e.g. 400, 429) use a generic digest to suppress Sentry noise.
    if (status === 401 || status === 403 || status === 404) {
      this.digest = `NEXT_HTTP_ERROR_FALLBACK;${status}`
    } else if (status >= 400 && status < 500) {
      this.digest = `EXPECTED_CLIENT_ERROR;${status}`
    }

    if (dataRecord) {
      if (typeof dataRecord.code === 'string') {
        this.code = dataRecord.code
      }
      if (typeof dataRecord.request_id === 'string') {
        this.requestId = dataRecord.request_id
      }
    }
  }
}

/**
 * Check whether a value is a 4xx ApiError. Used by Sentry beforeSend hooks to
 * drop expected client errors from event reporting.
 */
export function isExpectedApiError(value: unknown): boolean {
  return (
    value != null &&
    typeof value === 'object' &&
    'name' in value &&
    value.name === 'ApiError' &&
    'status' in value &&
    typeof value.status === 'number' &&
    value.status >= 400 &&
    value.status < 500
  )
}
