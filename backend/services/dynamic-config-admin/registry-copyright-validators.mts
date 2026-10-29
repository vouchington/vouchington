import { parseCopyrightDsaSorDatabaseFrom } from '@services/copyright-notices/dsa-start-date'
import { DynamicConfigValidationError } from 'valkyries/dynamic-config'
import type { DynamicConfigFields } from '@vouchington/dynamic-config'

/** A blank date is the disabled/unset state; nonblank values must be real UTC calendar dates. */
export function validateCopyrightDsaSorDatabaseFrom(next: DynamicConfigFields): void {
  const reviewedAt = next.replayPolicyReviewedAt
  if (
    reviewedAt !== '' &&
    (typeof reviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(reviewedAt) ||
      !Number.isFinite(Date.parse(reviewedAt)) ||
      new Date(reviewedAt).toISOString() !== reviewedAt ||
      Date.parse(reviewedAt) > Date.now())
  )
    throw new DynamicConfigValidationError(
      'replayPolicyReviewedAt must be empty or a past UTC ISO timestamp',
    )
  const value = next.dsaSorDatabaseFrom
  if (value === '' || parseCopyrightDsaSorDatabaseFrom(value) !== null) return
  throw new DynamicConfigValidationError(
    'dsaSorDatabaseFrom must be empty or a real YYYY-MM-DD calendar date',
  )
}
