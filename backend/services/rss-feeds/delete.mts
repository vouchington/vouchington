import type { PrivateUser } from '@services/users/types'
import { currentUserCanDeleteRssFeed } from './authorization.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { markRssFeedCategorySnapshotsForReconciliation } from '@services/rss-feed-items/category-snapshot-reconciliations'
import { enqueueReconcileRssFeedItemCategorySnapshots } from '@queues/rss-feed-item-categories/enqueues'
import {
  lockPostPublicationRssFeedScopes,
  recordPostPublicationChange,
  recordRssFeedHardDeletePublicationChange,
} from '@services/post-publication'
import { lockRssFeedHardDeleteTopicAliasPublicationScopes } from '@services/post-publication/capture-rss-feed-hard-delete-aliases'

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
 * Hard-deletes an RSS feed. Internal use only — no auth check.
 * Prefer softDeleteRssFeedById for programmatic removal.
 */
export async function hardDeleteRssFeedById(id: string): Promise<boolean> {
  await using query = await beginTransaction()
  const { rowCount } = await hardDeleteInTransaction()
  await query.commit()
  await invalidate.rss_feeds(id)
  const affected = (rowCount ?? 0) > 0
  if (affected) {
    void enqueueReconcileRssFeedItemCategorySnapshots()
    void enqueueRefreshTopHashtags()
  }
  return affected

  async function hardDeleteInTransaction() {
    // ast-grep-ignore: no-three-sequential-awaits -- category aliases must precede the feed lifecycle, source, and row locks.
    await lockRssFeedHardDeleteTopicAliasPublicationScopes(query, id)
    await lockPostPublicationRssFeedScopes(query, [id])
    await query(
      `/* hardDeleteRssFeedById:lockSources */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [id],
    )
    const locked = await query(sql`/* hardDeleteRssFeedById:lock */
      SELECT id FROM rss_feeds WHERE id = ${id} FOR UPDATE
    `)
    if ((locked.rowCount ?? 0) === 0) return locked
    // ast-grep-ignore: no-three-sequential-awaits -- capture and reconciliation marks must retain pre-delete rows before the feed cascade.
    await recordRssFeedHardDeletePublicationChange(query, id)
    await markRssFeedCategorySnapshotsForReconciliation(query, id)
    const result = await query(
      sql`/* hardDeleteRssFeedById */ DELETE FROM rss_feeds WHERE id = ${id}`,
    )
    return result
  }
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
  return await hardDeleteRssFeedById(id)
}
