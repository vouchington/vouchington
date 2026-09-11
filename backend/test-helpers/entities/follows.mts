import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Create a follow relationship between two users
 */
export async function insertTestLocalFollow(
  followerId: string,
  followingId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO relation__user__follow__user (subject_id, object_id)
    VALUES (${followerId}, ${followingId})
    ON CONFLICT DO NOTHING
  `)
}

export async function insertTestLegacyLocalFollow(
  followerId: string,
  followingId: string,
): Promise<void> {
  await write(sql`
    INSERT INTO relation__user__follow__user (
      subject_id,
      object_id,
      outbound_ap_follow_activity_id
    )
    VALUES (${followerId}, ${followingId}, NULL)
    ON CONFLICT DO NOTHING
  `)
}

/**
 * Create a mute relationship (subject mutes object)
 */
export async function insertTestMute(subjectId: string, objectId: string): Promise<void> {
  await write(sql`
    INSERT INTO relation__user__mute__user (subject_id, object_id)
    VALUES (${subjectId}, ${objectId})
    ON CONFLICT DO NOTHING
  `)
}

/**
 * Create a block relationship (subject blocks object)
 */
export async function insertTestBlock(subjectId: string, objectId: string): Promise<void> {
  await write(sql`
    INSERT INTO relation__user__block__user (subject_id, object_id)
    VALUES (${subjectId}, ${objectId})
    ON CONFLICT DO NOTHING
  `)
}

/**
 * Check whether a follow relationship exists between two users
 */
export async function getFollowExists(followerId: string, followingId: string): Promise<boolean> {
  const { rows } = await read(sql`
    SELECT 1
    FROM relation__user__follow__user
    WHERE subject_id = ${followerId}::uuid
      AND object_id = ${followingId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
