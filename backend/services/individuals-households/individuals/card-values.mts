import assert from 'http-assert'
import { parseUtcDay } from '@modules/utils'

export function normalizeIndividualCardDate(
  value: string | Date | null,
  fieldName: string,
): string | null {
  const normalized = value instanceof Date ? value.toISOString().slice(0, 10) : value || null
  if (normalized === null) return null

  try {
    parseUtcDay(normalized)
  } catch {
    assert(false, 422, `${fieldName} must be a date in YYYY-MM-DD format`)
  }
  return normalized
}
