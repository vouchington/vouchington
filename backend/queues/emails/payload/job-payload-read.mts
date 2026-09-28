import { JobPayloadError } from './job-payload-error.mts'

export function asRecord(data: unknown, label: string): Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new JobPayloadError(`${label} must be an object`)
  }
  return data
}

export function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new JobPayloadError(`unexpected property ${key}`)
  }
}

export function requiredString(record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== 'string') throw new JobPayloadError(`${key} must be a string`)
}

export function optionalString(record: Record<string, unknown>, key: string): void {
  const value = record[key]
  if (value === undefined) return
  if (typeof value !== 'string') throw new JobPayloadError(`${key} must be a string`)
}

export function optionalNullableString(record: Record<string, unknown>, key: string): void {
  const value = record[key]
  if (value === undefined || value === null) return
  if (typeof value !== 'string') throw new JobPayloadError(`${key} must be a string or null`)
}

export function requiredEnum(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
): void {
  const value = record[key]
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new JobPayloadError(`${key} is not a known value`)
  }
}
