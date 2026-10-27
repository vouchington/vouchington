import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertActivityPubInboxCapacityDeliveriesForTest } from './entities/activitypub-inbox-storage.mts'

/** Small owned expiry-category fixture. */
export async function createUnverifiedActivityPubCleanupFixture() {
  const ids = await insertActivityPubInboxCapacityDeliveriesForTest(3, 4, true)
  const [pending, failed, unexpired] = ids
  if (!pending || !failed || !unexpired) throw new Error('Missing owned cleanup identities')
  await write(sql`/* createUnverifiedActivityPubCleanupFixture */
    UPDATE activitypub_inbox_envelopes
    SET failed_at = CASE WHEN id = ${failed} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END,
        first_failed_at = CASE WHEN id = ${failed} THEN CURRENT_TIMESTAMP - INTERVAL '1 minute' ELSE NULL END,
        last_error = CASE WHEN id = ${failed} THEN 'owned failure' ELSE NULL END,
        received_at = CASE WHEN id = ${unexpired} THEN CURRENT_TIMESTAMP ELSE received_at END,
        retention_expires_at = CASE WHEN id = ${unexpired} THEN CURRENT_TIMESTAMP + INTERVAL '1 hour' ELSE retention_expires_at END
    WHERE id = ANY(${ids}::uuid[])
  `)
  const foreign = await insertActivityPubInboxCapacityDeliveriesForTest(1, 7, true)
  return { ids, eligible: [pending, failed], retained: [unexpired], foreign }
}
