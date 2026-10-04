import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type EuParticipantSettlement = {
  id: string
  body_name: string
  referred_at: Date
  outcome: { result: string; decided_at: Date; implemented_at: Date | null } | null
}

export async function selectEuParticipantSettlements(
  noticeId: string,
  userId: string,
  staff: boolean,
  transaction: TransactionQuery,
): Promise<EuParticipantSettlement[]> {
  const { rows } = await transaction<{
    id: string
    body_name: string
    referred_at: Date
    result: string | null
    decided_at: Date | null
    implemented_at: Date | null
  }>(sql`/* selectEuParticipantSettlements */
    SELECT referral.id, referral.body_name, referral.referred_at,
      outcome.result, outcome.decided_at, outcome.implemented_at
    FROM copyright_eu_dispute_settlement_referrals referral
    LEFT JOIN copyright_eu_dispute_settlement_outcomes outcome
      ON outcome.copyright_eu_dispute_settlement_referral_id = referral.id
    WHERE referral.copyright_notice_id = ${noticeId}
      AND (${staff} OR referral.referred_by_user_id = ${userId})
    ORDER BY referral.id
  `)
  return rows.map(row => ({
    id: row.id,
    body_name: row.body_name,
    referred_at: row.referred_at,
    outcome:
      row.result && row.decided_at
        ? { result: row.result, decided_at: row.decided_at, implemented_at: row.implemented_at }
        : null,
  }))
}
