import type { BatchValidationResult, RowValidationResult } from './types.mts'
import { claimedReferralValidationSlug } from './validate-topic-row-referral.mts'
import { claimedTopicSlug, validateTopicRow } from './validate-topic-row.mts'

export const ALLOWED_COLUMNS = new Set([
  'slug',
  'name',
  'topic_type',
  'markdown',
  'rss_feed_url',
  'rss_feed_title',
  'feed_type',
  'aliases',
  'parent_slugs',
  'extensions',
  'notes',
  'referral_validation_slug',
  'referral_user_help_text',
  'referral_hostname',
  'referral_pathname',
  'referral_example_url',
  'referral_company_slug',
])
export function validateTopicHeaders(headers: string[]): string[] {
  return headers.filter(h => !ALLOWED_COLUMNS.has(h))
}

function isObjectRow(row: unknown): row is Record<string, string> {
  return !!row && typeof row === 'object'
}

/** Indexes of rows repeating a key an earlier row already claimed. */
function repeatedKeyIndexes(keys: (string | undefined)[]): number[] {
  const firstIndexByKey = new Map(
    keys.flatMap((key, i) => (key === undefined ? [] : [[key, i] as const])).toReversed(),
  )
  return keys.flatMap((key, i) => (key !== undefined && firstIndexByKey.get(key) !== i ? [i] : []))
}

export function validateTopicRows(rows: Record<string, string>[]): BatchValidationResult {
  const duplicateSlugRows = new Set(
    repeatedKeyIndexes(rows.map(row => (isObjectRow(row) ? claimedTopicSlug(row) : undefined))),
  )
  const duplicateReferralRows = new Set(
    repeatedKeyIndexes(
      rows.map(row => (isObjectRow(row) ? claimedReferralValidationSlug(row) : undefined)),
    ),
  )
  const results: RowValidationResult[] = rows.map((row, i) => {
    const errors = isObjectRow(row)
      ? validateTopicRow(row, {
          isDuplicateSlug: duplicateSlugRows.has(i),
          isDuplicateReferralValidationSlug: duplicateReferralRows.has(i),
        })
      : ['Row must be an object']
    return { row_index: i, valid: errors.length === 0, errors }
  })

  return {
    valid: results.every(r => r.valid),
    rows: results,
  }
}
