import sql from 'sql-template-strings'
import { publicationRetainedKeyPageSql } from './retained-key-pages.mts'
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
    uuidValue: string | null
    textValue: string | null
    postType: string | null
    day: string | null
    live_post_id: string | null
  }>(
    sql`/* listPostPublicationIdentityKeys */ WITH page AS MATERIALIZED (`.append(
      publicationRetainedKeyPageSql(work.id, work.cursor_key_id, limit),
    ).append(sql`) SELECT page.*, identity.post_id AS live_post_id FROM page
        LEFT JOIN post_publication_post_identities identity ON identity.id = page.impact_post_identity_id ORDER BY page.id`),
  )
  const page = rows.slice(0, limit)
  return {
    identityKeys: page.flatMap(row =>
      toIdentityKey({
        id: row.id,
        kind: row.kind,
        uuid_value: row.uuidValue,
        text_value: row.textValue,
      }),
    ),
    missingPostIds: page.flatMap(row =>
      row.kind === 'impact_post' && row.uuidValue && row.live_post_id === null
        ? [row.uuidValue]
        : [],
    ),
    rssFeedItemIds: page.flatMap(row =>
      row.kind === 'impact_rss_feed_item' && row.uuidValue ? [row.uuidValue] : [],
    ),
    sitemapTargets: page.flatMap(row =>
      toSitemapTarget({ kind: row.kind, post_type: row.postType, day: row.day }),
    ),
    hasMore: rows.length === limit,
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
