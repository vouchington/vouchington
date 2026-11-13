import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  insertAcknowledgmentQuery,
  insertRoutingQuery,
} from '../services/copyright-notices/territorial-notice-receipt-sql.mts'
import { seedCommittedTerritorialAcknowledgment } from './copyright-territorial-acknowledged-fixture.mts'
import { seedCommittedTerritorialDecision } from './copyright-territorial-committed-decision.mts'
import type { PrivateUser } from '../services/users/types.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'

/** Report/materialization subjects consume an acknowledged, fully imposed human decision. */
export async function seedDsaProjectionDecision(
  jurisdiction: 'eu_dsa' | 'uk',
  staff: PrivateUser,
  noticeId: string,
  input: TerritorialCopyrightDecisionInput,
) {
  // The withdrawn-approval fixture retains its receipt directly, before routing/acknowledgment work exists.
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    receipt: string
    acknowledgment: string | null
    acknowledged_at: Date | null
    exhausted_at: Date | null
    routing: string | null
  }>(sql`/* seedDsaProjectionDecision:receiptWork */
    SELECT receipt.id AS receipt, acknowledgment.id AS acknowledgment,
      acknowledgment.acknowledged_at, acknowledgment.exhausted_at, routing.copyright_territorial_notice_receipt_id AS routing
    FROM copyright_territorial_notice_receipts receipt
    LEFT JOIN copyright_territorial_notice_acknowledgments acknowledgment
      ON acknowledgment.copyright_territorial_notice_receipt_id = receipt.id
    LEFT JOIN copyright_territorial_notice_routings routing
      ON routing.copyright_territorial_notice_receipt_id = receipt.id
    WHERE receipt.copyright_notice_id = ${noticeId} AND receipt.jurisdiction = ${jurisdiction}`)
  const receipt = rows[0]
  if (!receipt || receipt.exhausted_at)
    throw new Error('Owned projection receipt cannot be acknowledged')
  if (!receipt.routing) await transaction(insertRoutingQuery(receipt.receipt))
  if (!receipt.acknowledgment) await transaction(insertAcknowledgmentQuery(receipt.receipt))
  await transaction.commit()
  if (!receipt.acknowledged_at) await seedCommittedTerritorialAcknowledgment(jurisdiction, noticeId)
  await seedCommittedTerritorialDecision(jurisdiction, staff, noticeId, input)
}
