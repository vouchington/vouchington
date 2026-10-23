import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueBulkTopicAliasesUpdate } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { invalidate } from '@services/entity-cache/invalidate'
import { createTopicRevision } from '@services/topic-revisions'
import {
  lockTopicAliasPublicationScopes,
  lockTopicRssFeedAttachmentLifecycle,
} from '@services/post-publication'
import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import type { TopicAlias, TopicAliasOptions } from './alias-types.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { runTopicAliasTransaction } from './alias-transaction.mts'

export async function linkTopicAlias(
  topicId: string,
  aliasId: string,
  options: TopicAliasOptions = {},
): Promise<TopicAlias> {
  let previousTopicId: string | null = null
  const run = async (query: TransactionQuery) => {
    await lockTopicAliasPublicationScopes(query, [aliasId])
    await lockTopicRssFeedAttachmentLifecycle(query, topicId)
    const { rows: topicRows } = await query<{ id: string; merged_into_topic_id: string | null }>(
      `/* linkTopicAlias lockTopic */
      SELECT id, merged_into_topic_id
      -- no-mistakes-disable-next-line postgres-required-predicates: merged rows must be locked to preserve 409 conflict semantics
      FROM topics
      WHERE id = $1 AND deleted_at IS NULL
      FOR UPDATE`,
      [topicId],
    )
    const topic = topicRows[0]
    assert(topic, 404, 'Topic not found')
    assert(!topic.merged_into_topic_id, 409, 'Cannot add aliases to a merged topic')
    const { rows: aliasRows } = await query<Pick<TopicAlias, 'topic_id'>>(
      `/* linkTopicAlias lockAlias */
      SELECT topic_id
      FROM topic_aliases
      WHERE id = $1
      FOR UPDATE`,
      [aliasId],
    )
    const existingAlias = aliasRows[0]
    assert(existingAlias, 404, 'Topic alias not found')
    previousTopicId = existingAlias.topic_id
    const { rows } = await query<TopicAlias>(
      `/* linkTopicAlias */
      UPDATE topic_aliases
      SET topic_id = $1
      WHERE id = $2
        AND (
          topic_id IS NULL
          OR topic_id = $1
          OR NOT EXISTS (
            SELECT 1
            FROM topics active_owner
            WHERE active_owner.id = topic_aliases.topic_id
              AND active_owner.deleted_at IS NULL
              AND active_owner.merged_into_topic_id IS NULL
          )
        )
      RETURNING id, topic_id, alias
    `,
      [topicId, aliasId],
    )
    const alias = rows[0]
    assert(alias, 409, 'Topic alias is linked to another topic')
    if (previousTopicId !== topicId) {
      await recordTopicAliasPublicationChanges(query, [
        { aliasId: alias.id, alias: alias.alias, previousTopicId, nextTopicId: topicId },
      ])
    }
    if (options.revisedById) {
      await createTopicRevision(
        topicId,
        'update',
        { topic_alias_link: { before: null, after: { id: alias.id, alias: alias.alias } } },
        options.revisedById,
        { query },
      )
    }
    return alias
  }
  const linkedAlias = await runTopicAliasTransaction(options, run)
  if (!options.skipSideEffects) {
    void addEntityBloomKeys('topics', [normalizeKey(linkedAlias.alias)])
    const affectedTopicIds = previousTopicId ? [...new Set([previousTopicId, topicId])] : [topicId]
    await Promise.all([
      invalidate.topicsWithMetrics(affectedTopicIds, linkedAlias.alias),
      invalidatePostsForTopicAliases([linkedAlias.id]),
    ])
    void enqueueBulkTopicAliasesUpdate(affectedTopicIds)
  }
  return linkedAlias
}
