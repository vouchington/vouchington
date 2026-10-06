import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Expire only the owned claim so a test can exercise takeover without wall-clock sleeps. */
export async function expireActivityDistributionLeaseForTest(
  activityId: string,
  leaseToken: string,
): Promise<void> {
  await write(sql`/* expireActivityDistributionLeaseForTest */
    UPDATE activitypub_distribution_work_items
    SET leased_at = clock_timestamp() - INTERVAL '2 seconds',
      lease_expires_at = clock_timestamp() - INTERVAL '1 second'
    WHERE activity_id = ${activityId} AND lease_token = ${leaseToken}
  `)
}
