import { beginTransaction } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import sql from 'sql-template-strings'
import {
  candidateReconciliationToken,
  getCandidateReconciliation,
  readCandidateReconciliationChildren,
  type CandidateReconciliation,
} from './candidate-reconciliation-state.mts'

/** One database-only page; feed locks precede work locks, matching ingestion's lock order. */
export async function reconcileRssFeedItemCandidatePage(itemId: string): Promise<string | null> {
  const observed = await getCandidateReconciliation(itemId)
  if (!observed) return null
  const pageSize = getPostPublicationWorkLimit('rss_feed_candidate_page_size')
  const ids = await readCandidateReconciliationChildren(observed, pageSize)
  await using transaction = await beginTransaction()
  if (observed.phase === 'sources' && ids.length > 0)
    await transaction(sql`/* lockCandidateReconciliationFeeds */
      SELECT id FROM rss_feeds WHERE id = ANY(${ids}::uuid[]) ORDER BY id
      LIMIT ${pageSize} FOR UPDATE`)
  const current = await getCandidateReconciliation(itemId, transaction, true)
  if (!current) return null
  if (candidateReconciliationToken(current) !== candidateReconciliationToken(observed))
    return candidateReconciliationToken(current)
  const sortAt = current.deleted_at === null ? current.sort_at : null
  if (ids.length > 0) {
    if (current.phase === 'sources')
      await transaction(sql`/* updateCandidateReconciliationSources */
        UPDATE rss_feed_item_sources SET item_sort_at = ${sortAt}
        WHERE rss_feed_item_id = ${itemId} AND rss_feed_id = ANY(${ids}::uuid[])`)
    else
      await transaction(sql`/* updateCandidateReconciliationTopics */
        UPDATE rss_feed_item_topic_candidates SET sort_at = ${sortAt}
        WHERE rss_feed_item_id = ${itemId} AND topic_id = ANY(${ids}::uuid[])`)
  }
  if (ids.length < pageSize && current.phase === 'topics') {
    await transaction(sql`/* completeCandidateReconciliation */
      DELETE FROM rss_feed_item_candidate_reconciliations
      WHERE rss_feed_item_id = ${itemId} AND generation = ${current.generation}::bigint`)
    await transaction.commit()
    return null
  }
  const phase = ids.length < pageSize ? 'topics' : current.phase
  const after = ids.at(-1) ?? null
  const { rows } =
    await transaction<CandidateReconciliation>(sql`/* checkpointCandidateReconciliation */
    UPDATE rss_feed_item_candidate_reconciliations
    SET phase = ${phase}::rss_feed_item_candidate_reconciliation_phases,
      cursor_feed_id = ${current.phase === 'sources' && phase === 'sources' ? after : null}::uuid,
      cursor_topic_id = ${current.phase === 'topics' ? after : null}::uuid
    WHERE rss_feed_item_id = ${itemId} AND generation = ${current.generation}::bigint
    RETURNING generation, phase, cursor_feed_id, cursor_topic_id`)
  await transaction.commit()
  return rows[0] ? candidateReconciliationToken(rows[0]) : null
}
