import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'

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
