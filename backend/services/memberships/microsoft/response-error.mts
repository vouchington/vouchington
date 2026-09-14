/** Typed Store API failure; only confirmed Store ID key errors are terminal evidence. */
export class MicrosoftStoreResponseError extends Error {
  readonly status: number
  readonly invalidStoreIdKey: boolean

  constructor(status: number, invalidStoreIdKey: boolean) {
    super(`Microsoft Store API request failed with ${status}`)
    this.status = status
    this.invalidStoreIdKey = invalidStoreIdKey
  }
}

/** A service-authentication failure must never poison a user's evidence. */
export function isInvalidStoreIdKeyResponse(status: number, payload: unknown): boolean {
  if (status < 400 || status >= 500 || status === 429 || !record(payload)) return false
  const error = record(payload.error) ? payload.error : payload
  const code = typeof error.code === 'string' ? error.code : null
  return code === 'InvalidStoreIdKey' || code === 'InvalidUserStoreIdKey'
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
