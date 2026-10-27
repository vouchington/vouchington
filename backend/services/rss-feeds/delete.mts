import type { PrivateUser } from '@services/users/types'
import { currentUserCanDeleteRssFeed } from './authorization.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { markRssFeedCategorySnapshotsForReconciliation } from '@services/rss-feed-items/category-snapshot-reconciliations'
import { enqueueReconcileRssFeedItemCategorySnapshots } from '@queues/rss-feed-maintenance/enqueues/item-categories'
import { enqueueNextHardDeleteRssFeedPages } from './hard-delete-next-page.mts'
import {
  lockPostPublicationRssFeedScopes,
  recordPostPublicationChange,
} from '@services/post-publication'

/**
 * Soft-deletes an RSS feed by setting deleted_at. Internal use only — no auth check.
 * Used by the fetch worker when the feed URL is permanently broken.
 * Returns true if the feed was soft-deleted, false if the feed was not found or already soft-deleted.
 */
export async function softDeleteRssFeedById(id: string): Promise<boolean> {
  await using query = await beginTransaction()
  const { rowCount } = await softDeleteInTransaction()
  await query.commit()
  const affected = (rowCount ?? 0) > 0
  if (affected) {
    await invalidate.rss_feeds(id)
    void enqueueReconcileRssFeedItemCategorySnapshots()
    void enqueueRefreshTopHashtags()
  }
  return affected

  async function softDeleteInTransaction() {
    await lockPostPublicationRssFeedScopes(query, [id])
    const locked = await query(sql`/* softDeleteRssFeedById:lock */
      SELECT id FROM rss_feeds WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE
    `)
    if ((locked.rowCount ?? 0) === 0) return locked
    const result = await query(sql`/* softDeleteRssFeedById */
      UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${id} AND deleted_at IS NULL
    `)
    if ((result.rowCount ?? 0) > 0) await markRssFeedCategorySnapshotsForReconciliation(query, id)
    if ((result.rowCount ?? 0) > 0) {
      await recordPostPublicationChange(query, {
        scope: { type: 'rss_feed', rssFeedId: id },
        reason: 'rss_feed_discoverability_changed',
      })
    }
    return result
  }
}

/**
 * Starts a resumable RSS feed hard delete. Internal use only — no auth check.
 * Prefer softDeleteRssFeedById for programmatic removal.
 */
export async function hardDeleteRssFeedById(id: string): Promise<boolean> {
  await using query = await beginTransaction()
  await lockPostPublicationRssFeedScopes(query, [id])
  await query(
    `/* hardDeleteRssFeedById:lockSources */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [id],
  )
  const { rows: feedRows } = await query<{ id: string; topic_id: string }>(
    `/* hardDeleteRssFeedById:lockFeed */
    SELECT id, topic_id FROM rss_feeds WHERE id = $1::uuid FOR UPDATE`,
    [id],
  )
  if (feedRows.length === 0) {
    await query.commit()
    return false
  }
  // An admin import row is retained history with an ON DELETE RESTRICT FK.
  // Reject before hiding the feed; the FK remains intact and the import is preserved.
  const { rows: referencedImports } = await query<{ id: string }>(
    `/* hardDeleteRssFeedById:adminImportReference */
    SELECT id FROM admin_import_rows WHERE rss_feed_id = $1::uuid LIMIT 1`,
    [id],
  )
  assert(referencedImports.length === 0, 409, 'Feed is referenced by admin import history')
  const { rowCount } = await query(sql`/* hardDeleteRssFeedById:start */
    UPDATE rss_feeds
    SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
        hard_delete_requested_at = COALESCE(hard_delete_requested_at, CURRENT_TIMESTAMP)
    WHERE id = ${id}
  `)
  const affected = (rowCount ?? 0) > 0
  if (affected) {
    registerPostCommitAction(query, async () => {
      await Promise.all([
        invalidate.rss_feeds(id),
        enqueueNextHardDeleteRssFeedPages([id]),
        enqueueRefreshTopHashtags(),
      ])
    })
  }
  await query.commit()
  return affected
}

/**
 * Hard-deletes an RSS feed as an admin user.
 * Throws 403 if the current user is not an admin.
 */
export async function hardDeleteRssFeedByIdAsCurrentUser(
  currentUser: PrivateUser,
  id: string,
): Promise<boolean> {
  assert(currentUserCanDeleteRssFeed(currentUser), 403, 'Forbidden')
  return hardDeleteRssFeedById(id)
}
