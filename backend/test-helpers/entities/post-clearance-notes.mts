import { v7 as uuidv7 } from 'uuid'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function appendTestPlatformRejectionNote(
  postId: string,
  note: string,
  occurredAt?: Date,
  sequence = 0,
): Promise<string> {
  const changeId = occurredAt ? uuidv7({ msecs: occurredAt.getTime(), seq: sequence }) : null
  const { rows } = await write<{ id: string }>(sql`/* appendTestPlatformRejectionNote */
    WITH current_change AS (
      SELECT post.id AS post_id, post.clearance_changed_by_id AS changed_by_id,
        post.clearance_version + 1 AS next_clearance_version
      FROM posts post
      WHERE post.id = ${postId}
    ), inserted_change AS (
      INSERT INTO post_clearance_changes (
        id, post_id, change_type, changed_by_id, public_reason_code, private_note,
        is_platform_override, platform_override_clearance_version, metadata
      )
      SELECT COALESCE(${changeId}::uuid, uuidv7()), post_id, 'reject', changed_by_id,
        'staff_rejected', ${note}, TRUE, next_clearance_version,
        '{"test_fixture":true}'::jsonb
      FROM current_change
      WHERE changed_by_id IS NOT NULL
      RETURNING id, post_id, created_at, changed_by_id, public_reason_code, is_platform_override
    )
    UPDATE posts
    SET clearance_version = posts.clearance_version + 1,
      clearance_changed_at = inserted_change.created_at,
      clearance_changed_by_id = inserted_change.changed_by_id,
      clearance_public_reason_code = inserted_change.public_reason_code,
      clearance_is_platform_override = inserted_change.is_platform_override,
      approved_at = NULL,
        rejected_at = inserted_change.created_at,
        in_review_at = NULL
    FROM inserted_change
    WHERE posts.id = inserted_change.post_id
    RETURNING inserted_change.id
  `)
  if (!rows[0]) throw new Error('Expected a platform rejection change')
  return rows[0].id
}
