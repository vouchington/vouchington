import { STATUS_CODES } from 'node:http'

export function getErrorStatus(error: unknown): number {
  if (!isObjectLike(error)) return 500
  const status = getValidHttpStatus(error.status) ?? getValidHttpStatus(error.statusCode)
  if (status) {
    return status
  }
  return 500
}

export function normalizeErrorForLogging(error: Error): Error {
  const status = getErrorStatus(error)
  if (status >= 500) {
    Object.assign(error, { status })
  }
  return error
}

export function getErrorResponseMessage(error: unknown, status: number): string {
  if (error instanceof Error) {
    return error.message
  }
  if (isObjectLike(error) && error.message !== undefined && error.message !== null) {
    return safeString(error.message) ?? getStatusMessage(status)
  }
  if (isObjectLike(error) || error === null || error === undefined) {
    return getStatusMessage(status)
  }
  return safeString(error) ?? getStatusMessage(status)
}

export function getErrorResponseCode(error: unknown, status: number): string | undefined {
  if (isObjectLike(error) && typeof error.code === 'string') {
    return error.code
  }
  return status >= 500 ? 'INTERNAL_ERROR' : undefined
}

export function getErrorResponseStack(error: unknown): string | undefined {
  if (isObjectLike(error) && typeof error.stack === 'string') {
    return error.stack
  }
  return undefined
}

function getValidHttpStatus(status: unknown): number | undefined {
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
    return status
  }
  return undefined
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function safeString(value: unknown): string | undefined {
  try {
    return String(value)
  } catch {
    return undefined
  }
}

function getStatusMessage(status: number): string {
  return STATUS_CODES[status] ?? 'Internal Server Error'
}
