import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  enqueueBulkTopicAliasesUpdate,
  enqueueTopicAliasRemovalUpdate,
} from '@queues/topic-aliases/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import { createTopicRevision } from '@services/topic-revisions'
import { normalizeHashtag } from '@ts-shared/utils'
import assert from 'http-assert'
import type { TopicAlias, TopicAliasOptions } from './alias-types.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'
import { updateTopicAliasesField } from './update-aliases-field.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'

export async function unlinkTopicAlias(
  aliasId: string,
  options: TopicAliasOptions = {},
): Promise<TopicAlias | null> {
  const run = async (query: TransactionQuery) => {
    await lockTopicAliasPublicationScopes(query, [aliasId])
    const { rows: ownerRows } = await query<{ topic_id: string | null }>(
      `/* unlinkTopicAlias readOwner */ SELECT topic_id FROM topic_aliases WHERE id = $1`,
      [aliasId],
    )
    const ownerTopicId = ownerRows[0]?.topic_id
    if (ownerTopicId) {
      await query(
        `/* unlinkTopicAlias lockTopic */
        SELECT id FROM topics
        WHERE id = $1 AND deleted_at IS NULL AND merged_into_topic_id IS NULL
        FOR UPDATE`,
        [ownerTopicId],
      )
    }
    const { rows: existingRows } = await query<TopicAlias & { active_topic_slug: string | null }>(
      `/* unlinkTopicAlias lock */
      SELECT
        topic_aliases.id,
        topic_aliases.topic_id,
        topic_aliases.alias,
        active_topic.slug AS active_topic_slug
      FROM topic_aliases
      LEFT JOIN topics active_topic
        ON active_topic.id = topic_aliases.topic_id
        AND active_topic.deleted_at IS NULL
        AND active_topic.merged_into_topic_id IS NULL
      WHERE topic_aliases.id = $1
      FOR UPDATE OF topic_aliases`,
      [aliasId],
    )
    const existing = existingRows[0]
    if (!existing) return null
    assert(existing.topic_id === ownerTopicId, 409, 'Topic alias owner changed; retry the request')
    assert(
      !options.expectedTopicId || existing.topic_id === options.expectedTopicId,
      409,
      'Topic alias is not linked to this topic',
    )
    assert(existing.alias !== existing.active_topic_slug, 409, 'Cannot unlink an active topic slug')
    const preservesAlias = Boolean(normalizeHashtag(existing.alias))
    if (!preservesAlias && existing.topic_id) {
      await recordTopicAliasPublicationChanges(query, [
        {
          aliasId: existing.id,
          alias: existing.alias,
          previousTopicId: existing.topic_id,
          nextTopicId: null,
        },
      ])
    }
    if (preservesAlias) {
      await query(
        `/* unlinkTopicAlias preserveHashtag */ UPDATE topic_aliases SET topic_id = NULL WHERE id = $1`,
        [aliasId],
      )
    } else {
      await query(
        `/* unlinkTopicAlias deleteOrdinaryAlias */ DELETE FROM topic_aliases WHERE id = $1`,
        [aliasId],
      )
    }
    if (existing.topic_id) {
      if (preservesAlias) {
        await recordTopicAliasPublicationChanges(query, [
          {
            aliasId: existing.id,
            alias: existing.alias,
            previousTopicId: existing.topic_id,
            nextTopicId: null,
          },
        ])
      }
      await updateTopicAliasesField(existing.topic_id, { query, skipSideEffects: true })
      if (options.revisedById) {
        await createTopicRevision(
          existing.topic_id,
          'update',
          {
            topic_alias_unlink: {
              before: { id: existing.id, alias: existing.alias },
              after: null,
            },
          },
          options.revisedById,
          { query },
        )
      }
    }
    return { alias: { ...existing, topic_id: null }, previousTopicId: existing.topic_id }
  }
  const result = await runInTransaction(options, run)

  if (result && !options.skipSideEffects && result.previousTopicId) {
    await Promise.all([
      invalidate.topics(result.previousTopicId, result.alias.alias),
      invalidate.topic_metrics(result.previousTopicId),
      invalidatePostsForTopicAliases([result.alias.id]),
    ])
    if (normalizeHashtag(result.alias.alias)) {
      void enqueueTopicAliasRemovalUpdate(result.previousTopicId, result.alias.id)
    } else {
      void enqueueBulkTopicAliasesUpdate([result.previousTopicId])
    }
  }
  return result?.alias ?? null
}

async function runInTransaction<Result>(
  options: TopicAliasOptions,
  run: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
