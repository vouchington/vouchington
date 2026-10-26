import { listHardDeleteRssFeedNextPages } from './hard-delete-next-page.mts'
import { beginTransaction } from '@data-stores/psql'
import {
  uniquePublicationKeys,
  type PublicationCapturedKey,
} from '@services/post-publication/captured-keys'
import { enqueueCapturedPublicationChangeAfterCommit } from '@services/post-publication/direct-capture'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication/capture-rss-feeds'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import type { RssFeedHardDeleteChildPhase } from '@queues/rss-feed-maintenance/types'
import { lockHardDeleteRssFeedChildRows } from './hard-delete-child-rows.mts'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'

// Closed allowlist: no table or column name comes from queue data.
const CHILD_TABLES: Record<
  RssFeedHardDeleteChildPhase,
  {
    table: string
    key: string
    feedColumn: string
    minId?: boolean
  }
> = {
  setting_changes: {
    table: 'rss_feed_setting_changes',
    key: 'id',
    feedColumn: 'rss_feed_id',
  },
  crawls: {
    table: 'rss_feed_crawls',
    key: 'id',
    feedColumn: 'rss_feed_id',
    minId: true,
  },
  community_list_feeds: {
    table: 'community_list_rss_feeds',
    key: 'id',
    feedColumn: 'rss_feed_id',
  },
  curated_asides: {
    table: 'curated_aside_items',
    key: 'id',
    feedColumn: 'rss_feed_id',
  },
  user_import_requests: {
    table: 'user_import_requests',
    key: 'id',
    feedColumn: 'rss_feed_id',
  },
  feed_categories: {
    table: 'rss_feed_categories',
    key: 'category_identity_id',
    feedColumn: 'rss_feed_id',
  },
  canonical_redirects: {
    table: 'rss_feeds',
    key: 'id',
    feedColumn: 'canonical_rss_feed_id',
  },
  user_import_rows: {
    table: 'user_rss_feed_import_rows',
    key: 'id',
    feedColumn: 'rss_feed_id',
  },
}

/** One bounded, committed page of child rows that would otherwise cascade at parent DELETE. */
export async function hardDeleteRssFeedChildPage(
  rssFeedId: string,
  phase: RssFeedHardDeleteChildPhase,
  expectedCursor?: string,
): Promise<{ removed: number; hasMore: boolean }> {
  const target = CHILD_TABLES[phase]
  if (!target) throw new TypeError(`Unsupported RSS feed hard-delete phase ${phase}`)
  const limit = getPostPublicationWorkLimit('rss_feed_hard_delete_capture_batch_size')
  await using query = await beginTransaction()
  const { rows: parentFootprint } =
    phase === 'feed_categories'
      ? await query<{ topic_id: string }>(
          `/* hardDeleteRssFeedChildPage:parentTopicFootprint */
          SELECT topic_id FROM rss_feeds
          WHERE id = $1::uuid AND hard_delete_requested_at IS NOT NULL`,
          [rssFeedId],
        )
      : { rows: [] }
  const categoryFootprint =
    phase === 'feed_categories'
      ? (
          await query<{ category_identity_id: string; topic_id: string | null }>(
            `/* hardDeleteRssFeedChildPage:categoryFootprint */
            SELECT category_identity_id, topic_id FROM rss_feed_categories
            WHERE rss_feed_id = $1::uuid ORDER BY category_identity_id LIMIT $2`,
            [rssFeedId, limit],
          )
        ).rows
      : null
  if (categoryFootprint) {
    await withTopicReferenceAttachmentFences(
      [
        ...parentFootprint.map(row => row.topic_id),
        ...categoryFootprint.flatMap(row => (row.topic_id ? [row.topic_id] : [])),
      ],
      { query },
      async () => {},
    )
  }
  await lockPostPublicationRssFeedScopes(query, [rssFeedId])
  const feed = await query<{ id: string; topic_id: string }>(
    `/* hardDeleteRssFeedChildPage:feed */
    SELECT id, topic_id FROM rss_feeds WHERE id = $1::uuid AND hard_delete_requested_at IS NOT NULL FOR UPDATE`,
    [rssFeedId],
  )
  if (feed.rows.length === 0) {
    await query.commit()
    return { removed: 0, hasMore: false }
  }
  if (categoryFootprint && feed.rows[0]!.topic_id !== parentFootprint[0]?.topic_id) {
    await query.commit()
    return { removed: 0, hasMore: true }
  }
  if (expectedCursor !== undefined) {
    const current = (await listHardDeleteRssFeedNextPages([rssFeedId], { query }))[0]
    if (current?.phase !== phase || current.cursor !== expectedCursor) {
      await query.commit()
      return { removed: 0, hasMore: false }
    }
  }
  const rows = await lockHardDeleteRssFeedChildRows(query, rssFeedId, phase, limit)
  if (expectedCursor !== undefined && rows[0]?.id !== expectedCursor) {
    await query.commit()
    return { removed: 0, hasMore: false }
  }
  if (
    categoryFootprint &&
    (rows.length !== categoryFootprint.length ||
      rows.some(
        (row, index) =>
          row.id !== categoryFootprint[index]?.category_identity_id ||
          row.topic_id !== categoryFootprint[index]?.topic_id,
      ))
  ) {
    await query.commit()
    return { removed: 0, hasMore: true }
  }
  if (rows.length > 0) {
    const ids = rows.map(row => row.id)
    const keys: PublicationCapturedKey[] = uniquePublicationKeys([
      ...rows.flatMap(row =>
        row.topic_id ? [{ kind: 'impact_topic' as const, uuidValue: row.topic_id }] : [],
      ),
      ...rows.flatMap(row =>
        row.community_id
          ? [{ kind: 'impact_community' as const, uuidValue: row.community_id }]
          : [],
      ),
      ...rows.flatMap(row =>
        row.user_id ? [{ kind: 'identity_author' as const, uuidValue: row.user_id }] : [],
      ),
      ...(phase === 'canonical_redirects'
        ? ids.map(uuidValue => ({ kind: 'identity_rss_feed' as const, uuidValue }))
        : []),
    ])
    if (phase === 'canonical_redirects' || phase === 'user_import_rows') {
      await query(
        `/* hardDeleteRssFeedChildPage:clearReference */
        UPDATE ${target.table} SET ${target.feedColumn} = NULL
        WHERE ${target.feedColumn} = $1::uuid AND ${target.key} = ANY($2::uuid[])`,
        [rssFeedId, ids],
      )
    } else {
      await query(
        `/* hardDeleteRssFeedChildPage:deleteRows */
        DELETE FROM ${target.table}
        WHERE ${target.feedColumn} = $1::uuid AND ${target.key} = ANY($2::uuid[])
          ${target.minId ? 'AND id > $1::uuid' : ''}`,
        [rssFeedId, ids],
      )
    }
    if (keys.length > 0)
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'rss_feed', rssFeedId },
        reason: 'rss_feed_source_changed',
        scopeStart: false,
        keys,
      })
  }
  await query.commit()
  return { removed: rows.length, hasMore: rows.length === limit }
}
