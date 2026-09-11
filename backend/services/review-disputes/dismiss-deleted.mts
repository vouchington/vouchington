import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function dismissPendingDisputesForDeletedReview(postId: string): Promise<number> {
  const { rows } = await write(sql`/* dismissPendingDisputesForDeletedReview */
    WITH dismissed AS (
      UPDATE review_disputes
      SET resolution_action = 'dismiss',
          resolved_at = NOW(),
          latest_lifecycle_change_id = uuidv7(),
          updated_at = CURRENT_TIMESTAMP
      WHERE post_id = ${postId}
        AND resolved_at IS NULL
      RETURNING id, latest_lifecycle_change_id, resolved_at
    ),
    inserted_changes AS (
      INSERT INTO review_dispute_lifecycle_changes (
        id, review_dispute_id, change_type, changed_by_id, resolved_at, resolution_action
      )
      SELECT latest_lifecycle_change_id, id, 'dismiss', NULL, resolved_at, 'dismiss'
      FROM dismissed
    )
    SELECT id FROM dismissed
  `)
  return rows.length
}
