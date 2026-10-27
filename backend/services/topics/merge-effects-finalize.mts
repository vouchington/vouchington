import type { TransactionQuery } from '@data-stores/psql'
import { invalidateResolvedTopicKeysStrict } from '@services/entity-cache/invalidate-strict'
import { enqueueOnTopicUpdated } from '@queues/entity-listeners/enqueues'
import { enqueueBulkTopicAliasesUpdate } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import { normalizeKey } from '@ts-shared/utils/strings'

/** Runs after the source redirect commits, before the operation reports completed. */
export async function finalizeTopicMergeEffects(
  query: TransactionQuery,
  sourceId: string,
  destinationId: string,
  mergerId: string,
): Promise<void> {
  const { rows } = await query<{ id: string; slug: string }>(
    // no-mistakes-disable-next-line postgres-required-predicates: cache invalidation includes the retained merged source identity, not an authorization read.
    `/* finalizeTopicMergeEffects */ SELECT id, slug FROM topics WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [[sourceId, destinationId]],
  )
  await invalidateResolvedTopicKeysStrict(rows.flatMap(row => [row.id, normalizeKey(row.slug)]))
  await Promise.all([
    enqueueBulkTopicAliasesUpdate([sourceId, destinationId]),
    enqueueOnTopicUpdated(sourceId, mergerId),
    enqueueOnTopicUpdated(destinationId, mergerId),
  ])
}
