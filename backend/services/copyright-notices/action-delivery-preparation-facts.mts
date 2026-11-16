import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  copyrightActionDeliveryFacts,
  type CopyrightActionFacts,
} from './action-delivery-facts.mts'
import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'

/** Preparation reads authority; lifecycle and domain writes acquire their own row locks. */
export async function readCopyrightActionPreparation(
  intentId: string,
  leaseToken: string,
  query: TransactionQuery,
): Promise<LockedCopyrightActionDelivery | null> {
  const statement = copyrightActionDeliveryFacts().append(sql`/* readCopyrightActionPreparation */
    WHERE intent.id = ${intentId} AND intent.state = 'claimed'
      AND intent.lease_token = ${leaseToken} AND intent.lease_expires_at > clock_timestamp()`)
  const { rows } = await query<CopyrightActionFacts>(statement)
  const facts = rows[0]
  if (!facts) return null
  if (!facts.copyright_notice_deadline_id)
    return { ...facts, earliest_restoration_at: null, resolved_at: null, cancelled_at: null }
  const { rows: deadlines } = await query<
    Pick<LockedCopyrightActionDelivery, 'earliest_restoration_at' | 'resolved_at' | 'cancelled_at'>
  >(sql`
    /* readCopyrightActionPreparation:deadline */
    SELECT earliest_restoration_at, resolved_at, cancelled_at
    FROM copyright_notice_deadlines WHERE id = ${facts.copyright_notice_deadline_id}
  `)
  return deadlines[0] ? { ...facts, ...deadlines[0] } : null
}
