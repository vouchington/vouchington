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

/**
 * Response-facing `user_referral_program_links` columns. Pass `alias` when the statement joins
 * other tables; omit it for single-table SELECT and RETURNING.
 */
export function userReferralLinkColumns(alias?: string): string {
  const prefix = alias ? `${alias}.` : ''
  return userReferralLinkColumnNames.map(column => `${prefix}${column}`).join(', ')
}
