import { randomUUID } from 'node:crypto'
import { assertWhitelistedSqlIdentifier, beginTransaction, write } from '@data-stores/psql'
import { POST_LIST_TABLES } from '@services/users/profile-collection-tables'
import type { PrivateUser } from '@services/users/types'

export const COLLECTION_TYPES = ['hidden', 'following', 'subscribed'] as const

const ELIGIBLE_POSTS = 205
const DELETED_POSTS = 25
const DELETED_RELATIONS = 20
const TOTAL_POSTS = ELIGIBLE_POSTS + DELETED_POSTS + DELETED_RELATIONS
const OTHER_USERS = 6

export async function seedPrivatePostCollectionsCapacity() {
  await using query = await beginTransaction()
  const usernamePrefix = `explain-private-posts-${randomUUID()}`
  const { rows: users } = await query<{ id: string; username: string }>(
    `/* seedPrivatePostCollectionsUsers */
     INSERT INTO users (username)
     SELECT $1 || '-' || n FROM generate_series(0, $2) n
     RETURNING id, username`,
    [usernamePrefix, OTHER_USERS],
  )
  const userIds = users.toSorted((a, b) => a.username.localeCompare(b.username)).map(row => row.id)
  const viewer = {
    __entity_type: 'user',
    id: userIds[0]!,
    roles: [],
  } as PrivateUser

  const { rows: posts } = await query<{ id: string; title: string }>(
    `/* seedPrivatePostCollectionsPosts */
     INSERT INTO posts (
       id, created_via, post_type, title, markdown, created_by_id, approved_at, deleted_at,
       privacy, broadcast, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
     )
     SELECT uuidv7(INTERVAL '-1 day'), 'system', 'discussion', n::text, 'Collection fixture', $1, CURRENT_TIMESTAMP,
       CASE WHEN n > $2 AND n <= $2::int + $3::int THEN CURRENT_TIMESTAMP END,
       'public', 'everyone', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
     FROM generate_series(1, $4) n
     RETURNING id, title`,
    [viewer.id, ELIGIBLE_POSTS, DELETED_POSTS, TOTAL_POSTS],
  )
  const postIds = posts.toSorted((a, b) => Number(a.title) - Number(b.title)).map(row => row.id)
  const { rows: comments } = await query<{ id: string }>(
    `/* seedPrivatePostCollectionsHiddenComment */
     INSERT INTO posts (
       id, created_via, post_type, markdown, created_by_id, parent_post_id, root_post_id,
       approved_at, privacy, broadcast,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
     )
     VALUES (uuidv7(INTERVAL '-23 hours'), 'system', 'comment', 'Hidden comment on visible root', $1, $2, $2,
       CURRENT_TIMESTAMP, 'public', 'everyone', decode(repeat('00', 32), 'hex'),
       decode(repeat('00', 32), 'hex'))
     RETURNING id`,
    [viewer.id, postIds[0]],
  )
  const commentId = comments[0]!.id
  const relationIds = [...postIds, commentId]
  const { rows: timestamps } = await query<{ created_at: Date }>(
    `/* seedPrivatePostCollectionsTimestamp */ SELECT date_trunc('seconds', CURRENT_TIMESTAMP - INTERVAL '2 minutes') AS created_at`,
  )
  const anchor = timestamps[0]!.created_at
  const allowedTables = new Set(COLLECTION_TYPES.map(type => POST_LIST_TABLES[type]))
  for (const type of COLLECTION_TYPES) {
    const table = assertWhitelistedSqlIdentifier(
      POST_LIST_TABLES[type],
      allowedTables,
      'privatePostCollectionTable',
    )
    await query(
      `/* seedPrivatePostCollectionsRelations */
       INSERT INTO ${table} (subject_id, object_id, created_by_id, created_at, deleted_at)
       SELECT member_id, object_id, member_id,
         $4::timestamptz + ((n - 1) / 8) * INTERVAL '1 second',
         CASE WHEN n > $5::int + $6::int AND n <= $7 THEN $4::timestamptz END
       FROM unnest($1::uuid[]) AS member(member_id)
       CROSS JOIN unnest($2::uuid[]) WITH ORDINALITY AS target(object_id, n)
       WHERE n <= $7 OR $3`,
      [userIds, relationIds, type === 'hidden', anchor, ELIGIBLE_POSTS, DELETED_POSTS, TOTAL_POSTS],
    )
  }
  await query(
    `/* seedPrivatePostCollectionsSlugs */
     INSERT INTO post_slugs (post_id, slug)
     SELECT post_id, $2 || '-' || n
     FROM unnest($1::uuid[]) WITH ORDINALITY AS target(post_id, n)`,
    [postIds, usernamePrefix],
  )
  await query.commit()

  const expectedPosts = postIds
    .slice(0, ELIGIBLE_POSTS)
    .map((id, index) => ({
      id,
      timestamp: (anchor.getTime() + Math.floor(index / 8) * 1000) * 1000,
    }))
    .toSorted((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))

  return { viewer, userIds, postIds: relationIds, expectedPosts }
}

export async function cleanPrivatePostCollectionsCapacity(userIds: string[], postIds: string[]) {
  await write(
    '/* cleanupPrivatePostCollectionsPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
    [postIds],
  )
  await write(
    '/* cleanupPrivatePostCollectionsUsers */ DELETE FROM users WHERE id = ANY($1::uuid[])',
    [userIds],
  )
}
