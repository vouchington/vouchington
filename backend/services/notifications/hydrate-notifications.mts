import { read } from '@data-stores/psql'
import {
  buildNotificationPostRecipientEligibilityFilter,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { itemHasDiscoverableSourceSql } from '@modules/feed-query-builders/discoverability-sql'
import { firstVisibleRssTextField, visibleRssText } from '@modules/utils'
import sql from 'sql-template-strings'
import { hydratePublicTexts } from './hydrate-public-texts.mts'
import { truncateText } from './shared.mts'
import type {
  Notification,
  NotificationActor,
  NotificationCommunity,
  NotificationCopyrightNotice,
  NotificationHydration,
  NotificationPost,
  NotificationRssFeedItem,
} from './types.mts'

type HydrationSource = Pick<
  Notification,
  | 'kind'
  | 'user_id'
  | 'post_id'
  | 'top_post_id'
  | 'rss_feed_item_id'
  | 'actor_user_id'
  | 'sent_by_id'
  | 'community_id'
  | 'copyright_notice_id'
  | 'review_dispute_id'
  | 'moderation_appeal_id'
  | 'user_warning_id'
  | 'community_application_id'
  | 'copyright_notice_delivery_work_item_id'
>

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.flatMap(value => value ?? []))]
}

async function readCommunities(userId: string, ids: string[], applicationIds: string[]) {
  if (ids.length === 0) return []
  const { rows } = await read<NotificationCommunity>(sql`/* hydrateNotificationCommunities */
    SELECT c.id, c.slug, c.name
    FROM communities c
    WHERE c.id = ANY(${ids}::uuid[])
      AND c.deleted_at IS NULL
      AND (
        c.visibility = 'public'
        OR EXISTS (
          SELECT 1 FROM community_applications ca
          WHERE ca.id = ANY(${applicationIds}::uuid[]) AND ca.community_id = c.id
            AND ca.user_id = ${userId} AND ca.reviewed_at IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM community_members cm
          WHERE cm.community_id = c.id AND cm.user_id = ${userId} AND cm.removed_at IS NULL
        )
      )
  `)
  return rows
}

async function readPosts(userId: string, manualIds: string[], subscribedIds: string[]) {
  const ids = [...manualIds, ...subscribedIds]
  if (ids.length === 0) return []
  const query = sql`/* hydrateNotificationPosts */
    SELECT post.id, post.post_type, post.title, post.markdown, post.community_id,
      CASE WHEN post.is_anonymous THEN NULL ELSE post.created_by_id END AS actor_user_id
    FROM posts post
    JOIN posts root_post ON root_post.id = COALESCE(post.root_post_id, post.id)
    WHERE post.id = ANY(${ids}::uuid[]) AND (
      (post.id = ANY(${manualIds}::uuid[]) AND `
  query
    .append(
      buildPublicPostEligibilityFilter('post', 'root_post', { includeRegisteredAudience: true }),
    )
    .append(sql`) OR (post.id = ANY(${subscribedIds}::uuid[]) AND `)
    .append(buildNotificationPostRecipientEligibilityFilter('post', 'root_post', userId))
    .append(sql`))`)
  const { rows } = await read<{
    id: string
    post_type: string
    title: string
    markdown: string
    community_id: string | null
    actor_user_id: string | null
  }>(query)
  return rows.map((row): NotificationPost => ({
    id: row.id,
    post_type: row.post_type,
    snippet: truncateText(row.title || row.markdown, 180),
    actor_user_id: row.actor_user_id,
    community_id: row.community_id,
  }))
}

async function readRssFeedItems(ids: string[]) {
  if (ids.length === 0) return []
  const query = sql`/* hydrateNotificationRssFeedItems */
    SELECT DISTINCT ON (item.id) item.id, item.data,
      COALESCE(feed.title, urls.url, 'RSS Feed') AS feed_name
    FROM rss_feed_items item
    JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
    JOIN rss_feeds feed ON feed.id = source.rss_feed_id
    JOIN urls ON urls.id = item.url_id
    WHERE item.id = ANY(${ids}::uuid[]) AND item.deleted_at IS NULL AND `
  query.append(itemHasDiscoverableSourceSql('item.id')).append(sql`
    ORDER BY item.id, source.created_at ASC
  `)
  const { rows } = await read<{
    id: string
    data: Record<string, string | undefined> | null
    feed_name: string
  }>(query)
  return rows.map((row): NotificationRssFeedItem => {
    const data = row.data ?? {}
    const text = firstVisibleRssTextField([
      data.title,
      data.contentSnippet,
      data.description,
      data.summary,
      data['media:description'],
    ])
    return {
      id: row.id,
      feed_name: truncateText(row.feed_name, 100),
      snippet: truncateText(visibleRssText(text), 180),
    }
  })
}

/** Reads the live facts for one page of notifications, bounded by the page's ids. */
export async function hydrateNotifications(
  userId: string,
  notifications: HydrationSource[],
): Promise<NotificationHydration> {
  const manualPostIds = unique(
    notifications.map(n => (n.kind === 'post_manual_send' ? n.post_id : null)),
  )
  const subscribedPostIds = unique(
    notifications.flatMap(n => [n.kind === 'post_manual_send' ? null : n.post_id, n.top_post_id]),
  )
  const noticeIds = unique(notifications.map(n => n.copyright_notice_id))

  const [posts, rssItems, publicTexts, notices] = await Promise.all([
    readPosts(userId, manualPostIds, subscribedPostIds),
    readRssFeedItems(unique(notifications.map(n => n.rss_feed_item_id))),
    hydratePublicTexts(userId, notifications),
    noticeIds.length === 0
      ? []
      : read<NotificationCopyrightNotice>(sql`/* hydrateNotificationCopyrightNotices */
          SELECT id, jurisdiction FROM copyright_notices WHERE id = ANY(${noticeIds}::uuid[])
        `).then(result => result.rows),
  ])

  const actorIds = unique([
    ...notifications.flatMap(n => [n.actor_user_id, n.sent_by_id]),
    ...posts.map(post => post.actor_user_id),
  ])
  const communityIds = unique([
    ...notifications.map(n => n.community_id),
    ...posts.map(post => post.community_id),
  ])
  const [communities, actors] = await Promise.all([
    readCommunities(
      userId,
      communityIds,
      unique(
        notifications.map(n =>
          n.kind === 'community_application_approved' || n.kind === 'community_application_rejected'
            ? n.community_application_id
            : null,
        ),
      ),
    ),
    actorIds.length === 0
      ? []
      : read<NotificationActor>(sql`/* hydrateNotificationActors */
          SELECT id, username FROM users
          WHERE id = ANY(${actorIds}::uuid[]) AND deleted_at IS NULL
        `).then(result => result.rows),
  ])

  const byId = <T extends { id: string }>(rows: T[]) =>
    Object.fromEntries(rows.map(row => [row.id, row]))
  return {
    communities: byId(communities),
    actors: byId(actors),
    posts: byId(posts),
    rss_feed_items: byId(rssItems),
    copyright_notices: byId(notices),
    public_texts: publicTexts,
  }
}
