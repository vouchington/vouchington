import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'

type LookupTable = 'stripe_event_types' | 'ai_service_tiers' | 'amazon_ses_bounce_subtypes'

/**
 * Hold an uncommitted lookup-row insert until the caller's ON CONFLICT DO NOTHING insert
 * blocks on it, then commit so the caller takes the conflict re-read path.
 */
export async function runWithConcurrentLookupRegistration<Result>(
  table: LookupTable,
  value: string,
  operation: () => Promise<Result>,
): Promise<{ lookupId: string; result: Result }> {
  await using holder = await beginTransaction()
  const { lookupId, queryMarker } = await insertUncommittedLookupRow(holder, table, value)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  const result = await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker,
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = operation()
      await waitForLock(pending)
      await holder.commit()
      return pending
    },
  )
  return { lookupId, result }
}

async function insertUncommittedLookupRow(
  holder: Awaited<ReturnType<typeof beginTransaction>>,
  table: LookupTable,
  value: string,
): Promise<{ lookupId: string; queryMarker: string }> {
  switch (table) {
    case 'stripe_event_types': {
      const { rows } = await holder<{ id: string }>(sql`/* testConcurrentStripeEventTypeHolder */
        INSERT INTO stripe_event_types (stripe_event_type) VALUES (${value}) RETURNING id
      `)
      return { lookupId: rows[0]!.id, queryMarker: 'registerStripeEventType' }
    }
    case 'ai_service_tiers': {
      const { rows } = await holder<{ id: string }>(sql`/* testConcurrentAiServiceTierHolder */
        INSERT INTO ai_service_tiers (service_tier) VALUES (${value}) RETURNING id
      `)
      return { lookupId: rows[0]!.id, queryMarker: 'registerAiUsageTier' }
    }
    case 'amazon_ses_bounce_subtypes': {
      const { rows } = await holder<{ id: string }>(sql`/* testConcurrentSesBounceSubtypeHolder */
        INSERT INTO amazon_ses_bounce_subtypes (amazon_ses_bounce_subtype)
        VALUES (${value})
        RETURNING id
      `)
      return { lookupId: rows[0]!.id, queryMarker: 'registerSesBounceSubtype' }
    }
  }
}
