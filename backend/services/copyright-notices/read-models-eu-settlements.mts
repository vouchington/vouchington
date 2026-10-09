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
  const pages = await selectSettlementRows([noticeId], staff ? null : userId, options, transaction)
  const page = pages.get(noticeId)!
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
  return (await selectEuStaffSettlementPages([noticeId], transaction, options)).get(noticeId)!
}

/** One statement for the staff audit page of every listed notice; each gets an entry. */
export async function selectEuStaffSettlementPages(
  noticeIds: readonly string[],
  transaction: TransactionQuery,
  options: { limit: number; afterId?: string } = { limit: 25 },
): Promise<Map<string, { results: EuStaffSettlement[]; page_info: PageInfo }>> {
  const pages = await selectSettlementRows(noticeIds, null, options, transaction)
  return new Map(
    noticeIds.map(noticeId => {
      const scope = euSettlementCursorScope(noticeId, 'staff-audit')
      const page = pages.get(noticeId)!
      const results = page.rows.map(row => ({
        ...toParticipantSettlement(row),
        referred_by_party: row.referred_by_party,
        referred_by_id: row.referred_by_id,
      }))
      return [
        noticeId,
        {
          results,
          page_info: buildPageInfo(results, {
            hasNextPage: page.hasNextPage,
            getCursor: item => ({ id: item.id, scope }),
          }),
        },
      ]
    }),
  )
}

async function selectSettlementRows(
  noticeIds: readonly string[],
  referredByUserId: string | null,
  options: { limit: number; afterId?: string },
  transaction: TransactionQuery,
): Promise<Map<string, { rows: SettlementRow[]; hasNextPage: boolean }>> {
  const query = sql`/* selectSettlementRows */
    SELECT referral.*
    FROM unnest(${[...noticeIds]}::uuid[]) AS listed(notice_id)
    CROSS JOIN LATERAL (
      SELECT referral.copyright_notice_id, referral.id, referral.body_name, referral.referred_at,
        referral.referred_by_party, referral.referred_by_id,
        outcome.result, outcome.decided_at, outcome.implemented_at
      FROM copyright_eu_dispute_settlement_referrals referral
      LEFT JOIN copyright_eu_dispute_settlement_outcomes outcome
        ON outcome.copyright_eu_dispute_settlement_referral_id = referral.id
      WHERE referral.copyright_notice_id = listed.notice_id`
  if (referredByUserId) query.append(sql` AND referral.referred_by_id = ${referredByUserId}`)
  if (options.afterId) query.append(sql` AND referral.id > ${options.afterId}`)
  query.append(sql`
      ORDER BY referral.id ASC LIMIT ${options.limit + 1}
    ) referral
    ORDER BY referral.id ASC
  `)
  const { rows } = await transaction<SettlementRow & { copyright_notice_id: string }>(query)
  // PostgreSQL returns canonical lowercase UUIDs, but a caller may spell the id in uppercase.
  const canonical = new Map(
    noticeIds.map(noticeId => [
      noticeId.toLowerCase(),
      { rows: [] as SettlementRow[], hasNextPage: false },
    ]),
  )
  for (const { copyright_notice_id: noticeId, ...row } of rows) {
    const page = canonical.get(noticeId.toLowerCase())!
    if (page.rows.length === options.limit) page.hasNextPage = true
    else page.rows.push(row)
  }
  return new Map(noticeIds.map(noticeId => [noticeId, canonical.get(noticeId.toLowerCase())!]))
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
