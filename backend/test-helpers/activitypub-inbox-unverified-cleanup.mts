import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertActivityPubInboxCapacityDeliveriesForTest } from './entities/activitypub-inbox-storage.mts'

/** Small owned expiry-category fixture. */
export async function createUnverifiedActivityPubCleanupFixture() {
  const ids = await insertActivityPubInboxCapacityDeliveriesForTest(5, 4, true)
  const [idle, stale, failed, active, unexpired] = ids
  if (!idle || !stale || !failed || !active || !unexpired)
    throw new Error('Missing owned cleanup identities')
  await write(sql`/* createUnverifiedActivityPubCleanupFixture */
    UPDATE activitypub_inbox_delivery_work_items
    SET failed_at = CASE WHEN id = ${failed} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END,
        first_failed_at = CASE WHEN id = ${failed} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END,
        last_error = CASE WHEN id = ${failed} THEN 'owned failure' ELSE NULL END,
        received_at = CASE WHEN id = ${unexpired} THEN CURRENT_TIMESTAMP ELSE received_at END,
        retention_expires_at = CASE WHEN id = ${unexpired} THEN CURRENT_TIMESTAMP + INTERVAL '1 hour' ELSE retention_expires_at END
    WHERE id = ANY(${ids}::uuid[])
  `)
  const foreign = await insertActivityPubInboxCapacityDeliveriesForTest(1, 7, true)
  return { ids, eligible: [idle, stale, failed, active], retained: [unexpired], foreign }
}
