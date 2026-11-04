import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  territorialClaimantDeliveryCte,
  type TerritorialDeliveryState,
} from './read-models-staff-territorial-delivery.mts'

/** The notifier of a notice, one per filing receipt. */
export type CopyrightTerritorialStaffClaimant = {
  receipt_id: string
  /** Null for a guest notifier, who has no account. */
  user_id: string | null
  informed_at: Date | null
  state: TerritorialDeliveryState | null
}

type ClaimantRow = CopyrightTerritorialStaffClaimant & { has_next_page: boolean }

export function territorialClaimantCursorScope(noticeId: string, decisionId: string): string {
  return `copyright-territorial-claimants:${noticeId}:${decisionId}:receipt-asc`
}

/** One page of the notifiers of a notice's live decision, ordered by filing receipt id. */
export async function selectTerritorialStaffClaimants(
  decision: { noticeId: string; decidedAt: Date },
  query: TransactionQuery,
  options: { limit: number; afterReceiptId?: string },
): Promise<{ results: CopyrightTerritorialStaffClaimant[]; hasNextPage: boolean }> {
  const statement = sql`/* selectTerritorialStaffClaimants */
    WITH candidates AS (
      SELECT receipt.id, receipt.copyright_notice_id, receipt.requester_user_id
      FROM copyright_territorial_notice_receipts receipt
      WHERE receipt.copyright_notice_id = ${decision.noticeId}`
  if (options.afterReceiptId) statement.append(sql` AND receipt.id > ${options.afterReceiptId}`)
  statement.append(sql`
      ORDER BY receipt.id
      LIMIT ${options.limit + 1}
    ), source AS (
      SELECT * FROM candidates ORDER BY id LIMIT ${options.limit}
    ), `)
  statement.append(territorialClaimantDeliveryCte(decision.noticeId, decision.decidedAt))
  statement.append(sql`
    SELECT receipt.id AS receipt_id, receipt.requester_user_id AS user_id,
      delivery.informed_at, delivery.state,
      (SELECT count(*) FROM candidates) > ${options.limit} AS has_next_page
    FROM source receipt
    CROSS JOIN delivery
    ORDER BY receipt.id
  `)
  const { rows } = await query<ClaimantRow>(statement)
  return {
    results: rows.map(({ has_next_page: _hasNext, ...claimant }) => claimant),
    hasNextPage: rows[0]?.has_next_page ?? false,
  }
}
