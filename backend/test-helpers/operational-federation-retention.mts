import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'

export async function insertOperationalRemoteActorForTest(
  query: TransactionQuery,
  fetchedAt: Date,
): Promise<{ id: string; actorUri: string; keyId: string }> {
  const actorUri = `https://retention-${randomUUID()}.example/users/actor`
  const keyId = `${actorUri}#main-key`
  const { rows: identities } = await query<{ id: string }>(
    `/* insertOperationalRemoteActorIdentityForTest */
     INSERT INTO remote_actor_identities (actor_uri) VALUES ($1) RETURNING id`,
    [actorUri],
  )
  const id = identities[0]!.id
  await query(
    `/* insertOperationalRemoteActorCacheForTest */
     INSERT INTO remote_actors (id, key_id, public_key_pem, inbox_url, fetched_at)
     VALUES ($1, $2, 'test-public-key', $3, $4)`,
    [id, keyId, `${actorUri}/inbox`, fetchedAt],
  )
  return { id, actorUri, keyId }
}

export async function reinsertOperationalRemoteActorCacheForTest(
  query: TransactionQuery,
  id: string,
  actorUri: string,
): Promise<void> {
  await query(
    `/* reinsertOperationalRemoteActorCacheForTest */
     INSERT INTO remote_actors (id, key_id, public_key_pem, inbox_url)
     VALUES ($1, $2, 'refetched-public-key', $3)`,
    [id, `${actorUri}#rotated-key`, `${actorUri}/inbox`],
  )
}

export async function insertOperationalLocalPostForTest(
  query: TransactionQuery,
): Promise<{ postId: string; userId: string }> {
  const { rows: users } = await query<{ id: string }>(
    `/* insertOperationalLikeUserForTest */ INSERT INTO users DEFAULT VALUES RETURNING id`,
  )
  const userId = users[0]!.id
  const { rows: posts } = await query<{ id: string }>(
    `/* insertOperationalLikePostForTest */
     INSERT INTO posts
       (post_type, title, markdown, created_by_id, created_via,
        bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     VALUES ('discussion', 'Retention test', '', $1, 'system', $2, $2)
     RETURNING id`,
    [userId, Buffer.alloc(32)],
  )
  return { postId: posts[0]!.id, userId }
}

export async function insertOperationalRemoteFollowForTest(
  query: TransactionQuery,
  remoteActorId: string,
  userId: string,
): Promise<void> {
  await query(
    `/* insertOperationalRemoteFollowForTest */
     INSERT INTO relation__remote_actor__follow__user (subject_id, object_id)
     VALUES ($1, $2)`,
    [remoteActorId, userId],
  )
}

export async function insertOperationalInboxWorkForTest(
  query: TransactionQuery,
  remoteActorId: string,
  actorUri: string,
): Promise<void> {
  await query(
    `/* insertOperationalInboxWorkForTest */
     INSERT INTO activitypub_inbox_delivery_work_items
       (request_method, request_target, expected_host, signature_header,
        digest_header, date_header, raw_body, claimed_activity_id,
        claimed_activity_type, claimed_actor_uri, sender_hostname,
        remote_actor_id, verified_at, sender_allowed_at)
     VALUES ('POST', '/ap/inbox', 'voucha.test', 'signature', 'digest', 'date',
             ''::bytea, $1, 'Like', $2, 'retention.example', $3,
             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [`${actorUri}/activities/${randomUUID()}`, actorUri, remoteActorId],
  )
}

export async function readOperationalLikeIdentityForTest(
  query: TransactionQuery,
  activityId: string,
): Promise<{ id: string; undone_at: Date | null } | null> {
  const { rows } = await query<{ id: string; undone_at: Date | null }>(
    `/* readOperationalLikeIdentityForTest */
     SELECT id, undone_at FROM activitypub_post_like_activities
     WHERE activity_id = $1`,
    [activityId],
  )
  return rows[0] ?? null
}

export async function readOperationalRemoteIdentityForTest(
  query: TransactionQuery,
  actorUri: string,
): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `/* readOperationalRemoteIdentityForTest */
     SELECT id FROM remote_actor_identities WHERE actor_uri = $1`,
    [actorUri],
  )
  return rows[0]?.id ?? null
}

export async function setOperationalLikeDeletedAtForTest(
  query: TransactionQuery,
  id: string,
  deletedAt: Date,
): Promise<void> {
  await query(
    `/* setOperationalLikeDeletedAtForTest */
     UPDATE activitypub_post_likes SET deleted_at = $2 WHERE id = $1`,
    [id, deletedAt],
  )
}

export async function countOperationalActiveLikesForTest(
  query: TransactionQuery,
  postId: string,
): Promise<number> {
  const { rows } = await query<{ total: string }>(
    `/* countOperationalActiveLikesForTest */
     SELECT count(*) AS total FROM activitypub_post_likes
     WHERE post_id = $1 AND deleted_at IS NULL`,
    [postId],
  )
  return Number(rows[0]!.total)
}

export async function insertOperationalUndoneFollowCycleForTest(
  query: TransactionQuery,
  remoteActorId: string,
  userId: string,
): Promise<string> {
  const activityId = `https://retention.example/follows/${randomUUID()}`
  await query(
    `/* insertOperationalUndoneFollowCycleForTest */
     INSERT INTO activitypub_remote_follow_activities
       (activity_id, remote_actor_identity_id, target_user_id, undone_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [activityId, remoteActorId, userId],
  )
  return activityId
}

export async function operationalFollowCycleExistsForTest(
  query: TransactionQuery,
  activityId: string,
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `/* operationalFollowCycleExistsForTest */
     SELECT EXISTS (
       SELECT 1 FROM activitypub_remote_follow_activities WHERE activity_id = $1
     ) AS exists`,
    [activityId],
  )
  return rows[0]!.exists
}
