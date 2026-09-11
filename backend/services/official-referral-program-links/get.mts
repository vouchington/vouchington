import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { OfficialReferralLink } from './types.mts'

export async function getOfficialReferralLink(
  linkId: string,
): Promise<OfficialReferralLink | null> {
  const { rows } = await read(sql`/* getOfficialReferralLink */
    SELECT l.*, u.url
    FROM user_referral_program_links l
    JOIN urls u ON u.id = l.url_id
    JOIN users usr ON usr.id = l.user_id
    WHERE l.id = ${linkId}
      AND l.deleted_at IS NULL
      AND usr.username = 'voucha'
  `)
  return rows[0] ?? null
}

export async function getOfficialReferralLinks(
  referralProgramId: string,
): Promise<OfficialReferralLink[]> {
  const { rows } = await read(sql`/* getOfficialReferralLinks */
    SELECT l.*, u.url
    FROM user_referral_program_links l
    JOIN urls u ON u.id = l.url_id
    JOIN users usr ON usr.id = l.user_id
    WHERE l.referral_program_id = ${referralProgramId}
      AND l.deleted_at IS NULL
      AND l.activated_at IS NOT NULL
      AND l.deactivated_at IS NULL
      AND usr.username = 'voucha'
    ORDER BY l.created_at DESC
  `)
  return rows
}
