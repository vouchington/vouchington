import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import type { TransactionQuery } from '@data-stores/psql/types'
import { buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'

export type EuParticipantSettlement = {
  id: string
  body_name: string
  referred_at: Date
  outcome: {
    result: FiniteValue<'copyright_eu_dispute_settlement_results'>
    decided_at: Date
    implemented_at: Date | null
  } | null
}
export type EuStaffSettlement = EuParticipantSettlement & {
  referred_by_party: 'poster' | 'notifier'
  referred_by_id: string | null
}
type Audience = 'participant' | 'staff-participant' | 'staff-audit'
type SettlementRow = {
  id: string
  body_name: string
  referred_at: Date
  referred_by_party: 'poster' | 'notifier'
  referred_by_id: string | null
  result: FiniteValue<'copyright_eu_dispute_settlement_results'> | null
  decided_at: Date | null
  implemented_at: Date | null
}

export function euSettlementCursorScope(
  noticeId: string,
  audience: Audience,
  viewerId?: string,
): string {
  return `copyright-eu-settlements:${noticeId}:${audience}:${viewerId ?? 'staff'}`
}

/** The participant response never projects the staff-only referral attribution. */
export async function selectEuParticipantSettlements(
  noticeId: string,
  userId: string,
  staff: boolean,
  transaction: TransactionQuery,
  options: { limit: number; afterId?: string } = { limit: 25 },
): Promise<{ results: EuParticipantSettlement[]; page_info: PageInfo }> {
  const audience = staff ? 'staff-participant' : 'participant'
  const scope = euSettlementCursorScope(noticeId, audience, userId)
  const page = await selectSettlementRows(noticeId, staff ? null : userId, options, transaction)
  const results = page.rows.map(toParticipantSettlement)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: page.hasNextPage,
      getCursor: item => ({ id: item.id, scope }),
    }),
  }
}

/** The staff audit response is a separate authorized projection and cursor audience. */
export async function selectEuStaffSettlements(
  noticeId: string,
  transaction: TransactionQuery,
  options: { limit: number; afterId?: string } = { limit: 25 },
): Promise<{ results: EuStaffSettlement[]; page_info: PageInfo }> {
  const scope = euSettlementCursorScope(noticeId, 'staff-audit')
  const page = await selectSettlementRows(noticeId, null, options, transaction)
  const results = page.rows.map(row => ({
    ...toParticipantSettlement(row),
    referred_by_party: row.referred_by_party,
    referred_by_id: row.referred_by_id,
  }))
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: page.hasNextPage,
      getCursor: item => ({ id: item.id, scope }),
    }),
  }
}

async function selectSettlementRows(
  noticeId: string,
  referredByUserId: string | null,
  options: { limit: number; afterId?: string },
  transaction: TransactionQuery,
): Promise<{ rows: SettlementRow[]; hasNextPage: boolean }> {
  const query = sql`/* selectSettlementRows */
    SELECT referral.id, referral.body_name, referral.referred_at,
      referral.referred_by_party, referral.referred_by_id,
      outcome.result, outcome.decided_at, outcome.implemented_at
    FROM copyright_eu_dispute_settlement_referrals referral
    LEFT JOIN copyright_eu_dispute_settlement_outcomes outcome
      ON outcome.copyright_eu_dispute_settlement_referral_id = referral.id
    WHERE referral.copyright_notice_id = ${noticeId}`
  if (referredByUserId) query.append(sql` AND referral.referred_by_id = ${referredByUserId}`)
  if (options.afterId) query.append(sql` AND referral.id > ${options.afterId}`)
  query.append(sql` ORDER BY referral.id ASC LIMIT ${options.limit + 1}`)
  const { rows } = await transaction<SettlementRow>(query)
  return { rows: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit }
}

function toParticipantSettlement(row: SettlementRow): EuParticipantSettlement {
  return {
    id: row.id,
    body_name: row.body_name,
    referred_at: row.referred_at,
    outcome:
      row.result && row.decided_at
        ? { result: row.result, decided_at: row.decided_at, implemented_at: row.implemented_at }
        : null,
  }
}
