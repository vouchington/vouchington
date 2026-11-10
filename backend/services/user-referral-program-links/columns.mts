import type { UserReferralLink } from './types.mts'

// Every declared UserReferralLink column and nothing else: created_by_id and deleted_by_id stay
// internal.
const userReferralLinkColumnNames = Object.keys({
  id: true,
  user_id: true,
  referral_program_id: true,
  url_id: true,
  label: true,
  activated_at: true,
  deactivated_at: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  consecutive_crawl_failures: true,
  last_crawl_failure_at: true,
  last_crawl_success_at: true,
  last_crawl_id: true,
  parent_link_id: true,
  unfurl_requested_at: true,
  unfurl_completed_at: true,
  unfurl_failed_at: true,
  unfurl_last_error: true,
} satisfies Record<keyof UserReferralLink, true>)

/** Management fields omitted from every non-owner list read. */
export const userReferralLinkPrivateFieldNames = [
  'label',
  'activated_at',
  'deactivated_at',
  'consecutive_crawl_failures',
  'last_crawl_failure_at',
  'last_crawl_success_at',
  'last_crawl_id',
  'unfurl_requested_at',
  'unfurl_completed_at',
  'unfurl_failed_at',
  'unfurl_last_error',
] as const satisfies readonly (keyof UserReferralLink)[]

const privateFieldNames = new Set<string>(userReferralLinkPrivateFieldNames)

function formatUserReferralLinkColumn(prefix: string, column: string): string {
  return column === 'referral_program_id'
    ? `${prefix}referral_program_topic_id AS referral_program_id`
    : `${prefix}${column}`
}

function joinUserReferralLinkColumns(columns: readonly string[], alias?: string): string {
  const prefix = alias ? `${alias}.` : ''
  return columns.map(column => formatUserReferralLinkColumn(prefix, column)).join(', ')
}

/**
 * Response-facing `user_referral_program_links` columns. Pass `alias` when the statement joins
 * other tables; omit it for single-table SELECT and RETURNING.
 */
export function userReferralLinkColumns(alias?: string): string {
  return joinUserReferralLinkColumns(userReferralLinkColumnNames, alias)
}

/** Owner lists include management columns. Every other list read gets the public columns only. */
export function userReferralLinkListColumns(alias: string, includePrivate: boolean): string {
  const columns = includePrivate
    ? userReferralLinkColumnNames
    : userReferralLinkColumnNames.filter(column => !privateFieldNames.has(column))
  return joinUserReferralLinkColumns(columns, alias)
}
