import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

/** A real matching history row even when the seed runs before the noon parent anchor. */
export async function seedParentHistory(): Promise<void> {
  await write(
    `/* seedExplainData */ INSERT INTO post_clearance_changes
      (id, post_id, change_type, is_creation_moderation_bypass)
     VALUES ($1, $2, 'approve', TRUE)
     ON CONFLICT DO NOTHING`,
    [seedUuidAtTimestamp(postSeedTimestampMs(0) + 1000, 700_000), seedUuid(0, '05')],
  )
}
