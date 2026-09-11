import { ApiError } from './error'
import { getApiErrorMessage } from './error-helpers'

export function getListSearchErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 422)) return null
  return getApiErrorMessage(error, 'Search failed')
}

export interface ListSearchErrorResult {
  error: string
}

export function isListSearchErrorResult(value: unknown): value is ListSearchErrorResult {
  return (
    value != null &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
  )
}
