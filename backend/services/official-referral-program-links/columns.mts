import type { OfficialReferralLink } from './types.mts'

type OfficialReferralLinkColumn = Exclude<keyof OfficialReferralLink, 'url'>

// Every declared OfficialReferralLink column on user_referral_program_links and nothing else; `url`
// comes from the urls join or the create input.
const officialReferralLinkColumnNames = Object.keys({
  id: true,
  user_id: true,
  referral_program_id: true,
  url_id: true,
  label: true,
  activated_at: true,
  deactivated_at: true,
  deleted_at: true,
  created_by_id: true,
  deleted_by_id: true,
  created_at: true,
} satisfies Record<OfficialReferralLinkColumn, true>)

/**
 * Response-facing official-link columns of `user_referral_program_links`. Pass `alias` when the
 * statement joins other tables; omit it for RETURNING.
 */
export function officialReferralLinkColumns(alias?: string): string {
  const prefix = alias ? `${alias}.` : ''
  return officialReferralLinkColumnNames.map(column => `${prefix}${column}`).join(', ')
}
