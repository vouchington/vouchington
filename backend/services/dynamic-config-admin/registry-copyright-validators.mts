import { parseCopyrightDsaSorDatabaseFrom } from '@services/copyright-notices/dsa-start-date'
import { DynamicConfigValidationError } from './namespace.mts'
import type { DynamicConfigFields } from './types.mts'

/** A blank date is the disabled/unset state; nonblank values must be real UTC calendar dates. */
export function validateCopyrightDsaSorDatabaseFrom(next: DynamicConfigFields): void {
  const value = next.dsaSorDatabaseFrom
  if (value === '' || parseCopyrightDsaSorDatabaseFrom(value) !== null) return
  throw new DynamicConfigValidationError(
    'dsaSorDatabaseFrom must be empty or a real YYYY-MM-DD calendar date',
  )
}
