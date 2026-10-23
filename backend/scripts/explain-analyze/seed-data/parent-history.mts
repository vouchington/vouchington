import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

/** A real matching history row even when the seed runs before the noon parent anchor. */
export async function seedParentHistory(): Promise<void> {
  await write(
    `/* seedExplainData */ WITH inserted_change AS (
      INSERT INTO post_clearance_changes (id, post_id, change_type)
      VALUES ($1, $2, 'approve')
      ON CONFLICT DO NOTHING
      RETURNING post_id
    )
    UPDATE posts SET has_creation_moderation_bypass = TRUE
    FROM inserted_change WHERE posts.id = inserted_change.post_id`,
    [seedUuidAtTimestamp(postSeedTimestampMs(0) + 1000, 700_000), seedUuid(0, '05')],
  )
}
