import type { BatchValidationResult, RowValidationResult } from './types.mts'
import { validateTopicRow } from './validate-topic-row.mts'

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

export function validateTopicRows(rows: Record<string, string>[]): BatchValidationResult {
  const results: RowValidationResult[] = []
  const seenSlugs = new Set<string>()
  const seenReferralValidationSlugs = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const errors: string[] = []
    if (!row || typeof row !== 'object') {
      errors.push('Row must be an object')
      results.push({ row_index: i, valid: false, errors })
      continue
    }
    errors.push(...validateTopicRow(row, { seenReferralValidationSlugs, seenSlugs }))

    results.push({ row_index: i, valid: errors.length === 0, errors })
  }

  return {
    valid: results.every(r => r.valid),
    rows: results,
  }
}
