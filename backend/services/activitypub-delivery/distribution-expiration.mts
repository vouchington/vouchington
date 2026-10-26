import { write, type QueryOptions } from '@data-stores/psql'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import sql from 'sql-template-strings'

/** Retire only an existing rejected checkpoint; never claim or resurrect an activity identity. */
export async function expireActivityDistributionCheckpoint(
  activityId: string,
  sourceUserId: string,
  options: QueryOptions = {},
): Promise<void> {
  if (!getDateFromUUIDv7(activityId)) return
  const query = options.query ?? write
  await query(sql`/* expireActivityDistributionCheckpoint */
    UPDATE activitypub_distribution_work_items
    SET completed_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE activity_id = ${activityId} AND source_user_id = ${sourceUserId}
      AND completed_at IS NULL
  `)
}
