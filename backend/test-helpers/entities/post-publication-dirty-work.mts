import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PostPublicationReason } from '../../services/post-publication/types.mts'
import sql from 'sql-template-strings'
export type TestPostPublicationDirtyWork = {
  id: string
  post_id: string | null
  author_user_id: string | null
  community_id: string | null
  rss_feed_id: string | null
  topic_alias_id: string | null
  story_id: string | null
  reasons: PostPublicationReason[]
  generation: string
  cursor_post_id: string | null
  cursor_topic_id: string | null
  cursor_key_id: string | null
  lease_token: string | null
  leased_at: Date | null
  lease_expires_at: Date | null
}
type TestPostPublicationScope =
  | { type: 'post'; id: string }
  | { type: 'author'; id: string }
  | { type: 'community'; id: string }
  | { type: 'rss_feed'; id: string }
  | { type: 'topic_alias'; id: string }
  | { type: 'story'; id: string }
export async function getTestPostPublicationDirtyWork(
  dirtyWorkId: string,
  options: QueryOptions = {},
): Promise<TestPostPublicationDirtyWork | undefined> {
  const { rows } = await read<TestPostPublicationDirtyWork>(
    sql`
    /* getTestPostPublicationDirtyWork */
    SELECT id, post_id, author_user_id, community_id, rss_feed_id, topic_alias_id, story_id, reasons,
      generation, cursor_post_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at
    FROM post_publication_dirty_work
    WHERE id = ${dirtyWorkId}
  `,
    options,
  )
  return rows[0]
}
export async function getTestPostPublicationDirtyWorkForScope(
  scope: TestPostPublicationScope,
  options: QueryOptions = {},
): Promise<TestPostPublicationDirtyWork | undefined> {
  const condition =
    scope.type === 'post'
      ? sql`post_id = ${scope.id}`
      : scope.type === 'author'
        ? sql`author_user_id = ${scope.id}`
        : scope.type === 'community'
          ? sql`community_id = ${scope.id}`
          : scope.type === 'rss_feed'
            ? sql`rss_feed_id = ${scope.id}`
            : scope.type === 'topic_alias'
              ? sql`topic_alias_id = ${scope.id}`
              : sql`story_id = ${scope.id}`
  const statement = sql`
    /* getTestPostPublicationDirtyWorkForScope */
    SELECT id, post_id, author_user_id, community_id, rss_feed_id, topic_alias_id, story_id, reasons,
      generation, cursor_post_id, cursor_topic_id, cursor_key_id, lease_token, leased_at, lease_expires_at
    FROM post_publication_dirty_work
    WHERE `
  statement.append(condition)
  const { rows } = await read<TestPostPublicationDirtyWork>(statement, options)
  return rows[0]
}
export async function countTestStoryPostPublicationDirtyWork(storyIds: string[]): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestStoryPostPublicationDirtyWork */
    SELECT COUNT(*)::text AS count FROM post_publication_dirty_work
    WHERE story_id = ANY(${storyIds}::uuid[])
  `)
  return Number(rows[0]?.count ?? 0)
}
export async function countTestPostPublicationDirtyWorkForPosts(
  postIds: string[],
): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestPostPublicationDirtyWorkForPosts */
    SELECT COUNT(*)::text AS count FROM post_publication_dirty_work
    WHERE post_id = ANY(${postIds}::uuid[])
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function countTestPostPublicationDirtyWorkForRssFeeds(
  rssFeedIds: string[],
): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestPostPublicationDirtyWorkForRssFeeds */
    SELECT COUNT(*)::text AS count FROM post_publication_dirty_work
    WHERE rss_feed_id = ANY(${rssFeedIds}::uuid[])
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function countTestPostPublicationIdentityKeysForRssFeeds(
  rssFeedIds: string[],
): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestPostPublicationIdentityKeysForRssFeeds */
    SELECT COUNT(*)::text AS count
    FROM post_publication_dirty_work_keys keys
    JOIN post_publication_dirty_work work ON work.id = keys.dirty_work_id
    WHERE work.rss_feed_id = ANY(${rssFeedIds}::uuid[])
      AND keys.kind = 'identity_rss_feed'
  `)
  return Number(rows[0]?.count ?? 0)
}

export async function countTestPostPublicationDirtyWorkForPostsWithReason(
  postIds: string[],
  reason: string,
): Promise<number> {
  const { rows } = await read<{ count: string }>(sql`
    /* countTestPostPublicationDirtyWorkForPostsWithReason */
    SELECT COUNT(*)::text AS count FROM post_publication_dirty_work
    WHERE post_id = ANY(${postIds}::uuid[]) AND ${reason} = ANY(reasons)
  `)
  return Number(rows[0]?.count ?? 0)
}
export async function isTestAuthorPublicationLifecycleLockWaiting(
  authorUserId: string,
): Promise<boolean> {
  const authorLockKey = `author:${authorUserId}`
  const { rows } = await read<{ waiting: boolean }>(sql`
    /* isTestAuthorPublicationLifecycleLockWaiting */
    SELECT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory'
        AND NOT granted
        AND classid::bigint = ((hashtextextended(${authorLockKey}, 0) >> 32) & 4294967295)
        AND objid::bigint = (hashtextextended(${authorLockKey}, 0) & 4294967295)
    ) AS waiting
  `)
  return rows[0]?.waiting ?? false
}
export async function listTestPostPublicationImpactPostIds(dirtyWorkId: string): Promise<string[]> {
  const { rows } = await read<{ uuid_value: string }>(sql`
    /* listTestPostPublicationImpactPostIds */
    SELECT uuid_value
    FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = ${dirtyWorkId} AND kind = 'impact_post'
    ORDER BY uuid_value
  `)
  return rows.map(row => row.uuid_value)
}

export async function listTestPostPublicationImpactTopicIds(
  dirtyWorkId: string,
): Promise<string[]> {
  const { rows } = await read<{ uuid_value: string }>(sql`
    /* listTestPostPublicationImpactTopicIds */
    SELECT uuid_value
    FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = ${dirtyWorkId} AND kind = 'impact_topic'
    ORDER BY uuid_value
  `)
  return rows.map(row => row.uuid_value)
}

export async function listTestPostPublicationImpactCommunityIds(
  dirtyWorkId: string,
): Promise<string[]> {
  const { rows } = await read<{ uuid_value: string }>(sql`
    /* listTestPostPublicationImpactCommunityIds */
    SELECT uuid_value
    FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = ${dirtyWorkId} AND kind = 'impact_community'
    ORDER BY uuid_value
  `)
  return rows.map(row => row.uuid_value)
}

export async function listTestPostPublicationRetainedTextKeys(
  dirtyWorkId: string,
  kind:
    | 'identity_author_username'
    | 'identity_post_slug'
    | 'identity_community_slug'
    | 'identity_topic_alias',
): Promise<string[]> {
  const { rows } = await read<{ text_value: string }>(sql`
    /* listTestPostPublicationRetainedTextKeys */
    SELECT text_value
    FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = ${dirtyWorkId} AND kind = ${kind}
    ORDER BY text_value
  `)
  return rows.map(row => row.text_value)
}
