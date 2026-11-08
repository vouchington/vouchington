/* oxlint-disable no-await-in-loop -- Sequential bounded batches preserve lock order and cap query inputs. */
import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { markPostPublicationScopeLocksHeld } from './lock.mts'

const heldAliasIdsByQuery = new WeakMap<TransactionQuery, Set<string>>()

export async function recordTopicAliasPublicationWork(
  query: TransactionQuery,
  topicAliasIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const ids = normalizePostPublicationIdentifiers(topicAliasIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    for (const topicAliasId of batch) {
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'topic_alias', topicAliasId },
        reason: 'post_topics_changed',
        keys: [],
      })
    }
  }
}
/** Acquires topic-alias publication scopes without recording work for a later mutation. */
export async function lockTopicAliasPublicationScopes(
  query: TransactionQuery,
  topicAliasIds: readonly string[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  const held = heldAliasIdsByQuery.get(query) ?? new Set<string>()
  const ids = normalizePostPublicationIdentifiers(topicAliasIds).filter(id => !held.has(id))
  heldAliasIdsByQuery.set(query, held)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // no-mistakes-disable-next-line query-reached-per-item: each input chunk is capped by runtime configuration; combining chunks would exceed that bound.
    await query(
      `/* lockTopicAliasPublicationCaptures */
      SELECT pg_advisory_xact_lock(hashtextextended('topic_alias:' || topic_alias_id::text, 0))
      FROM unnest($1::uuid[]) AS input(topic_alias_id) ORDER BY topic_alias_id`,
      [batch],
    )
    for (const topicAliasId of batch) held.add(topicAliasId)
    markPostPublicationScopeLocksHeld(
      query,
      batch.map(topicAliasId => ({ type: 'topic_alias', topicAliasId })),
    )
  }
}
