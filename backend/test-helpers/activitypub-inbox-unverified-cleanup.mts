import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertActivityPubInboxCapacityDeliveriesForTest } from './entities/activitypub-inbox-storage.mts'

/** Small native category/lease matrix; the actual twenty-page worker proof is a separate owner. */
export async function createUnverifiedActivityPubCleanupFixture() {
  const ids = await insertActivityPubInboxCapacityDeliveriesForTest(5, 4, true)
  const [idle, stale, failed, active, unexpired] = ids
  if (!idle || !stale || !failed || !active || !unexpired)
    throw new Error('Missing owned cleanup identities')
  await write(sql`/* createUnverifiedActivityPubCleanupFixture */
    UPDATE activitypub_inbox_delivery_work_items
    SET leased_at = CASE WHEN id IN (${stale}, ${failed}) THEN CURRENT_TIMESTAMP - INTERVAL '2 minutes'
          WHEN id = ${active} THEN CURRENT_TIMESTAMP ELSE NULL END,
        attempt_count = CASE WHEN id IN (${stale}, ${failed}, ${active}) THEN 1 ELSE 0 END,
        lease_expires_at = CASE WHEN id = ${stale} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute'
          WHEN id IN (${failed}, ${active}) THEN CURRENT_TIMESTAMP + INTERVAL '1 minute' ELSE NULL END,
        failed_at = CASE WHEN id = ${failed} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END,
        first_failed_at = CASE WHEN id = ${failed} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END,
        last_error = CASE WHEN id = ${failed} THEN 'owned failure' ELSE NULL END,
        received_at = CASE WHEN id = ${unexpired} THEN CURRENT_TIMESTAMP ELSE received_at END,
        retention_expires_at = CASE WHEN id = ${unexpired} THEN CURRENT_TIMESTAMP + INTERVAL '1 hour' ELSE retention_expires_at END
    WHERE id = ANY(${ids}::uuid[])
  `)
  const foreign = await insertActivityPubInboxCapacityDeliveriesForTest(1, 7, true)
  return { ids, eligible: [idle, stale, failed], retained: [active, unexpired], foreign }
}
