import { write } from '@data-stores/psql'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'

export type PostPublicationIdentityKey = {
  id: string
  kind: 'author' | 'community' | 'community_slug' | 'post_slug' | 'rss_feed' | 'topic_alias'
  value: string
}

export type PostPublicationRetainedKeyPage = {
  identityKeys: PostPublicationIdentityKey[]
  missingPostIds: string[]
  rssFeedItemIds: string[]
  sitemapTargets: Array<{ postType: string; day: string }>
  hasMore: boolean
  lastKeyId: string | null
}

export async function listPostPublicationIdentityKeys(
  work: ClaimedPostPublicationDirtyWork,
  limit: number,
): Promise<PostPublicationRetainedKeyPage> {
  const { rows } = await write<{
    id: string
    kind: string
    uuid_value: string | null
    text_value: string | null
    post_type: string | null
    day: string | null
  }>(
    `/* listPostPublicationIdentityKeys */
    SELECT id, kind, uuid_value::text, text_value, post_type::text, day::text
    FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = $1
      AND kind IN (
        'identity_author', 'identity_author_username', 'identity_community',
        'identity_community_slug', 'identity_post_slug', 'identity_rss_feed',
        'identity_topic_alias', 'impact_post', 'impact_rss_feed_item', 'sitemap_target'
      )
      AND (
        kind <> 'impact_post'
        OR NOT EXISTS (SELECT 1 FROM posts WHERE posts.id = uuid_value)
      )
      AND ($2::uuid IS NULL OR id > $2::uuid)
    ORDER BY id LIMIT $3`,
    [work.id, work.cursor_key_id, limit + 1],
  )
  const page = rows.slice(0, limit)
  return {
    identityKeys: page.flatMap(toIdentityKey),
    missingPostIds: page.flatMap(row =>
      row.kind === 'impact_post' && row.uuid_value ? [row.uuid_value] : [],
    ),
    rssFeedItemIds: page.flatMap(row =>
      row.kind === 'impact_rss_feed_item' && row.uuid_value ? [row.uuid_value] : [],
    ),
    sitemapTargets: page.flatMap(toSitemapTarget),
    hasMore: rows.length > limit,
    lastKeyId: page.at(-1)?.id ?? null,
  }
}

function toIdentityKey(row: {
  id: string
  kind: string
  uuid_value: string | null
  text_value: string | null
}): PostPublicationIdentityKey[] {
  const kind = identityKind(row.kind)
  const value = row.uuid_value ?? row.text_value
  return kind && value ? [{ id: row.id, kind, value }] : []
}

function identityKind(value: string): PostPublicationIdentityKey['kind'] | undefined {
  switch (value) {
    case 'identity_author':
    case 'identity_author_username':
      return 'author'
    case 'identity_community':
      return 'community'
    case 'identity_community_slug':
      return 'community_slug'
    case 'identity_post_slug':
      return 'post_slug'
    case 'identity_rss_feed':
      return 'rss_feed'
    case 'identity_topic_alias':
      return 'topic_alias'
  }
  return undefined
}

function toSitemapTarget(row: {
  kind: string
  post_type: string | null
  day: string | null
}): Array<{ postType: string; day: string }> {
  return row.kind === 'sitemap_target' && row.post_type && row.day
    ? [{ postType: row.post_type, day: row.day }]
    : []
}
