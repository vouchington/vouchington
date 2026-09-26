/* oxlint-disable max-lines -- deletion capture keeps ordered preimage locks and durable impact retention together. */
import type { TransactionQuery } from '@data-stores/psql'
import { retainPostPublicationImpactKeys } from './capture-keys.mts'
import { lockAuthorPublicationLifecycle, postPublicationScopeLockKey } from './lock.mts'
import { recordPostPublicationChange } from './capture.mts'
import {
  lockRssFeedHardDeleteTopicAliasPublicationScopes,
  recordRssFeedHardDeleteTopicAliasPublicationScopes,
} from './capture-rss-feed-hard-delete-aliases.mts'
import { retainRssFeedHardDeleteTopicImpacts } from './capture-rss-feed-hard-delete-topics.mts'
import {
  prepareAuthorDeletionBeforePostReassignment,
  recordPreparedAuthorDeletionPublicationWork,
} from './capture-author-deletion.mts'
import { lockAuthorDeletionPublicationScopes } from './lock-author-deletion-scopes.mts'
import {
  retainPublicationIdentityBridges,
  type PublicationIdentityBridgeFamily,
} from './identity-bridges.mts'

export { processAuthorDeletionPublicationBatch } from './capture-author-deletion-batch.mts'
export { lockAuthorPublicationLifecycle } from './lock.mts'

const RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE = 500

/** Captures authored-post tombstones before the account deletion flow reassigns them. */
export async function recordAuthorDeletionBeforePostReassignment(
  query: TransactionQuery,
  authorUserId: string,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- author and post scopes must precede the locked deletion preimage.
  await lockAuthorPublicationLifecycle(query, authorUserId)
  await lockAuthorDeletionPublicationScopes(query, authorUserId, [])
  const capture = await prepareAuthorDeletionBeforePostReassignment(query, authorUserId)
  await recordPreparedAuthorDeletionPublicationWork(query, authorUserId, capture)
}

/** Retains story-post and category tombstones before a feed cascade removes its source edges. */
export async function recordRssFeedHardDeletePublicationChange(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- lifecycle, item, post, source, and category locks must precede tombstone capture.
  await lockRssFeedHardDeleteTopicAliasPublicationScopes(query, rssFeedId)
  await query(
    `/* lockRssFeedPublicationLifecycle */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [postPublicationScopeLockKey({ type: 'rss_feed', rssFeedId })],
  )
  await lockRssFeedHardDeleteItems(query, rssFeedId)
  await lockRssFeedHardDeletePosts(query, rssFeedId)
  await lockRssFeedHardDeleteSources(query, rssFeedId)
  await lockRssFeedHardDeleteCategories(query, rssFeedId)
  const work = await recordPostPublicationChange(query, {
    scope: { type: 'rss_feed', rssFeedId },
    reason: 'rss_feed_discoverability_changed',
  })
  await retainRssFeedHardDeletePostImpacts(query, rssFeedId, work.id)
  await retainRssFeedHardDeleteItemImpacts(query, rssFeedId, work.id)
  await retainRssFeedHardDeleteTopicImpacts(query, rssFeedId, work.id)
  await recordRssFeedHardDeleteTopicAliasPublicationScopes(query, rssFeedId)
}

async function retainRssFeedHardDeleteItemImpacts(
  query: TransactionQuery,
  rssFeedId: string,
  dirtyWorkId: string,
): Promise<void> {
  let afterItemId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each retained item-impact page is bounded.
    const result = await query(
      `/* getRssFeedHardDeleteItemImpacts */
      SELECT source.rss_feed_item_id
      FROM rss_feed_item_sources source
      WHERE source.rss_feed_id = $1::uuid
        AND ($2::uuid IS NULL OR source.rss_feed_item_id > $2::uuid)
      ORDER BY source.rss_feed_item_id
      LIMIT $3`,
      [rssFeedId, afterItemId, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ rss_feed_item_id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- each retained item-impact write is bounded.
    await retainPostPublicationImpactKeys(query, dirtyWorkId, {
      rssFeedItemIds: rows.map(row => row.rss_feed_item_id),
    })
    afterItemId = rows.at(-1)!.rss_feed_item_id
  }
}

async function lockRssFeedHardDeletePosts(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- globally ordered post pages precede source relation locks.
    const result = await query<{ id: string }>(
      `/* lockRssFeedHardDeletePosts */
      SELECT post.id
      FROM posts post
      WHERE EXISTS (
        SELECT 1
        FROM post__stories post_story
        JOIN rss_feed_items item ON item.story_id = post_story.story_id
        JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
        WHERE post_story.post_id = post.id AND source.rss_feed_id = $1::uuid
      )
        AND ($2::uuid IS NULL OR post.id > $2::uuid)
      ORDER BY post.id
      LIMIT $3
      FOR UPDATE OF post`,
      [rssFeedId, afterPostId, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- locked native post pages prepare the entire first bridge family before item/feed/alias writes.
    await retainLockedFeedIdentityPage(
      query,
      'post',
      rows.map(row => row.id),
    )
    afterPostId = rows.at(-1)!.id
  }
}

async function lockRssFeedHardDeleteItems(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  let afterItemId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- ascending item pages establish the shared item-row-first order.
    const result = await query<{ id: string }>(
      `/* lockRssFeedHardDeleteItems */
      SELECT item.id
      FROM rss_feed_items item
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
      WHERE source.rss_feed_id = $1::uuid
        AND ($2::uuid IS NULL OR item.id > $2::uuid)
      ORDER BY item.id
      LIMIT $3
      FOR UPDATE OF item`,
      [rssFeedId, afterItemId, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ id: string }> = result.rows
    if (rows.length === 0) return
    afterItemId = rows.at(-1)!.id
  }
}

async function lockRssFeedHardDeleteSources(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  let afterItemId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- source pages follow the globally ordered item/post locks.
    const result = await query<{ rss_feed_item_id: string }>(
      `/* lockRssFeedHardDeleteSources */
      SELECT source.rss_feed_item_id
      FROM rss_feed_item_sources source
      WHERE source.rss_feed_id = $1::uuid
        AND ($2::uuid IS NULL OR source.rss_feed_item_id > $2::uuid)
      ORDER BY source.rss_feed_item_id
      LIMIT $3
      FOR UPDATE OF source`,
      [rssFeedId, afterItemId, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ rss_feed_item_id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- source locks already follow all post-family preparation; item bridges precede feed/alias writes.
    await retainLockedFeedIdentityPage(
      query,
      'rss_feed_item',
      rows.map(row => row.rss_feed_item_id),
    )
    afterItemId = rows.at(-1)!.rss_feed_item_id
  }
}

async function retainLockedFeedIdentityPage(
  query: TransactionQuery,
  family: PublicationIdentityBridgeFamily,
  ids: string[],
): Promise<void> {
  for (let offset = 0; offset < ids.length; offset += 100) {
    // oxlint-disable-next-line no-await-in-loop -- only bounded chunks of the existing ordered locked preimage enter bridge ownership.
    await retainPublicationIdentityBridges(query, family, ids.slice(offset, offset + 100))
  }
}

async function lockRssFeedHardDeleteCategories(
  query: TransactionQuery,
  rssFeedId: string,
): Promise<void> {
  let afterItemId: string | null = null
  let afterCategoryText: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- category-relation pages follow all affected post locks.
    const result = await query<{ rss_feed_item_id: string; category_text: string }>(
      `/* lockRssFeedHardDeleteCategories */
      SELECT category.rss_feed_item_id, category.category_text
      FROM rss_feed_item_categories category
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = category.rss_feed_item_id
      WHERE source.rss_feed_id = $1::uuid
        AND (
          $2::uuid IS NULL
          OR (category.rss_feed_item_id, category.category_text) > ($2::uuid, $3::text)
        )
      ORDER BY category.rss_feed_item_id, category.category_text
      LIMIT $4
      FOR UPDATE OF category`,
      [rssFeedId, afterItemId, afterCategoryText, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ rss_feed_item_id: string; category_text: string }> = result.rows
    if (rows.length === 0) return
    const last = rows.at(-1)!
    afterItemId = last.rss_feed_item_id
    afterCategoryText = last.category_text
  }
}

async function retainRssFeedHardDeletePostImpacts(
  query: TransactionQuery,
  rssFeedId: string,
  dirtyWorkId: string,
): Promise<void> {
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each retained impact page is bounded.
    const result = await query<{ post_id: string }>(
      `/* getRssFeedHardDeletePostImpacts */
      SELECT post.id AS post_id
      FROM posts post
      WHERE EXISTS (
        SELECT 1
        FROM post__stories post_story
        JOIN rss_feed_items item ON item.story_id = post_story.story_id
        JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
        WHERE post_story.post_id = post.id AND source.rss_feed_id = $1::uuid
      )
        AND ($2::uuid IS NULL OR post.id > $2::uuid)
      ORDER BY post.id
      LIMIT $3`,
      [rssFeedId, afterPostId, RSS_FEED_HARD_DELETE_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ post_id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- each retained post impact page is bounded.
    await retainPostPublicationImpactKeys(query, dirtyWorkId, {
      postIds: rows.map(row => row.post_id),
    })
    afterPostId = rows.at(-1)!.post_id
  }
}
