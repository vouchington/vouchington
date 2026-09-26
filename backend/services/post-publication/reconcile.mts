import { write } from '@data-stores/psql'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { listPostPublicationIdentityKeys } from './identity-keys.mts'
import { retainCurrentPublicationIdentityKeys } from './current-identity-keys.mts'
import { retainCurrentPublicationTopicIds } from './topic-keys.mts'
import { listPublicationCandidates, type ReconciliationPost } from './publication-candidates.mts'
import { retainRssFeedNotificationImpacts } from './retain-rss-feed-notification-impacts.mts'
import { retainOrphanPublicationIdentities } from './orphan-identities.mts'
import {
  isPostPublicationTypedProtocolActive,
  materializePostPublicationIdentitySnapshot,
} from './identity-snapshots.mts'

export type { ReconciliationPost } from './publication-candidates.mts'

export const POST_PUBLICATION_RECONCILIATION_PAGE_SIZE = 100

export type PublicationSitemapTarget = {
  postType: (typeof SITEMAP_CONFIG.POST_TYPES)[number]
  day: string
}

/**
 * Rebuilds the cache-facing publication projections from primary state. It deliberately performs
 * no notification or push work: those effects require their own persisted intents.
 */
export async function reconcilePostPublicationDirtyWork(
  work: ClaimedPostPublicationDirtyWork,
  limit = POST_PUBLICATION_RECONCILIATION_PAGE_SIZE,
  selectedPostIds?: readonly string[],
): Promise<{
  processed: number
  hasMorePosts: boolean
  posts: ReconciliationPost[]
  orphanReceiptPostIds: string[]
  hasMoreOrphanReceipts: boolean
  cursorPostId: string | null
  topicIds: string[]
  hasMoreTopics: boolean
  sitemapTargets: PublicationSitemapTarget[]
  identityKeys: Array<{ id: string; kind: string; value: string }>
  missingPostIds: string[]
  rssFeedItemIds: string[]
  hasMoreIdentityKeys: boolean
  cursorKeyId: string | null
  hasIncompleteSnapshots: boolean
}> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Publication page limit must be positive')

  const typedProtocol = await isPostPublicationTypedProtocolActive()
  const [posts, orphanReceiptPage] = await Promise.all([
    listPublicationCandidates(work, limit, selectedPostIds, typedProtocol),
    listOrphanReceiptPostIds(work, limit),
  ])
  const snapshots = typedProtocol
    ? await posts.reduce(
        async (pending, post) => {
          const result = await pending
          const snapshot = await materializePostPublicationIdentitySnapshot(work, post, limit)
          if (snapshot.complete) post.identity_snapshot_id = snapshot.snapshotId
          result.push(snapshot)
          return result
        },
        Promise.resolve([] as Array<{ snapshotId: string; complete: boolean }>),
      )
    : []
  const orphanIdentitiesComplete =
    !typedProtocol || (await retainOrphanPublicationIdentities(work, orphanReceiptPage.ids, limit))
  if (!typedProtocol)
    await retainCurrentPublicationTopicIds(
      work.id,
      posts.map(post => post.id),
      work.topic_alias_id,
    )
  if (selectedPostIds && !typedProtocol)
    if (
      !(await retainCurrentPublicationIdentityKeys(
        work,
        posts.map(post => post.id),
      ))
    )
      throw new TypeError('Publication identity retention requires a current work lease')
  // Topic UUID order is independent of post UUID order. First retain topics from every post page;
  // only then drain the single generation-fenced topic cursor.
  const hasMorePosts = (selectedPostIds ?? posts).length === limit
  const hasIncompleteSnapshots =
    snapshots.some(snapshot => !snapshot.complete) || !orphanIdentitiesComplete
  const topicPage =
    hasMorePosts || orphanReceiptPage.hasMore || hasIncompleteSnapshots
      ? { ids: [], hasMore: false }
      : await listPublicationTopicIds(work, limit)
  if (
    !hasMorePosts &&
    !orphanReceiptPage.hasMore &&
    !topicPage.hasMore &&
    work.cursor_key_id === null &&
    work.rss_feed_id &&
    work.reasons.some(
      reason =>
        reason === 'rss_feed_discoverability_changed' || reason === 'rss_feed_enablement_changed',
    )
  )
    await retainRssFeedNotificationImpacts(work.id, work.rss_feed_id)
  const retainedKeyPage =
    !hasMorePosts && !orphanReceiptPage.hasMore && !topicPage.hasMore && !hasIncompleteSnapshots
      ? await listPostPublicationIdentityKeys(work, limit)
      : {
          identityKeys: [],
          missingPostIds: [],
          rssFeedItemIds: [],
          sitemapTargets: [],
          hasMore: false,
          lastKeyId: null,
        }
  const sitemapTargets = retainedKeyPage.sitemapTargets.flatMap(({ postType, day }) =>
    isSitemapPostType(postType) ? [{ postType, day }] : [],
  )
  for (const post of posts) {
    const target = getCurrentSitemapTarget(post)
    if (target) sitemapTargets.push(target)
  }
  return {
    processed: posts.length,
    hasMorePosts,
    posts,
    orphanReceiptPostIds: orphanReceiptPage.ids,
    hasMoreOrphanReceipts: orphanReceiptPage.hasMore,
    cursorPostId: selectedPostIds?.at(-1) ?? posts.at(-1)?.id ?? work.cursor_post_id,
    topicIds: topicPage.ids,
    hasMoreTopics: topicPage.hasMore,
    sitemapTargets: uniqueSitemapTargets(sitemapTargets),
    identityKeys: retainedKeyPage.identityKeys,
    missingPostIds: retainedKeyPage.missingPostIds,
    rssFeedItemIds: retainedKeyPage.rssFeedItemIds,
    hasMoreIdentityKeys: retainedKeyPage.hasMore,
    cursorKeyId: retainedKeyPage.lastKeyId,
    hasIncompleteSnapshots,
  }
}

async function listOrphanReceiptPostIds(
  work: ClaimedPostPublicationDirtyWork,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const { rows } = await write<{ post_id: string }>(
    `/* listOrphanPostPublicationProjectionReceiptIds */
    SELECT receipt.post_id
    FROM post_publication_projection_receipts receipt
    WHERE NOT EXISTS (SELECT 1 FROM posts WHERE posts.id = receipt.post_id)
      AND (receipt.post_id = $1::uuid OR EXISTS (
        SELECT 1 FROM post_publication_dirty_work_keys retained
        WHERE retained.dirty_work_id = $2 AND retained.kind = 'impact_post'
          AND retained.uuid_value = receipt.post_id
      ))
    ORDER BY receipt.post_id
    LIMIT $3`,
    [work.post_id, work.id, limit + 1],
  )
  return {
    ids: rows.slice(0, limit).map(row => row.post_id),
    hasMore: rows.length > limit,
  }
}

async function listPublicationTopicIds(
  work: ClaimedPostPublicationDirtyWork,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const { rows } = await write<{ topic_id: string }>(
    `/* listPublicationTopicIds */
    SELECT uuid_value AS topic_id FROM post_publication_dirty_work_keys
    WHERE dirty_work_id = $1 AND kind = 'impact_topic'
      AND uuid_value > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY uuid_value LIMIT $3`,
    [work.id, work.cursor_topic_id, limit + 1],
  )
  return { ids: rows.slice(0, limit).map(row => row.topic_id), hasMore: rows.length > limit }
}

function getCurrentSitemapTarget(post: ReconciliationPost): PublicationSitemapTarget | undefined {
  // Sitemap owns eligibility; always rebuild the existing candidate's shard.
  if (!isSitemapPostType(post.post_type)) return
  return { postType: post.post_type, day: post.sitemap_day }
}
function isSitemapPostType(value: string): value is (typeof SITEMAP_CONFIG.POST_TYPES)[number] {
  return (SITEMAP_CONFIG.POST_TYPES as readonly string[]).includes(value)
}
function uniqueSitemapTargets(targets: PublicationSitemapTarget[]): PublicationSitemapTarget[] {
  return [...new Map(targets.map(target => [`${target.postType}:${target.day}`, target])).values()]
}
