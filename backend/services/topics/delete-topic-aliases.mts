import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import {
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
} from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueTopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/enqueues/unlink-topic-alias'
import { invalidate } from '@services/entity-cache/invalidate'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { createTopicRevision } from '@services/topic-revisions'
import { normalizeHashtag } from '@ts-shared/utils'
import assert from 'http-assert'
import type { TopicAlias, TopicAliasOptions } from './alias-types.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { selectTopicAliasUnlinkNextPage } from './unlink-topic-alias-page.mts'

type LockedAlias = TopicAlias & {
  unlink_topic_id: string | null
  unlink_requested_at: Date | null
  active_topic_slug: string | null
}

export async function unlinkTopicAlias(
  aliasId: string,
  options: TopicAliasOptions = {},
): Promise<TopicAlias | null> {
  const run = async (query: TransactionQuery) => {
    await lockTopicAliasPublicationScopes(query, [aliasId])
    const { rows: ownerRows } = await query<{
      topic_id: string | null
      unlink_topic_id: string | null
    }>(
      `/* unlinkTopicAlias readOwner */
      SELECT topic_id, unlink_topic_id FROM topic_aliases WHERE id = $1`,
      [aliasId],
    )
    const owner = ownerRows[0]
    if (!owner) return null
    const topicToLock = owner.topic_id ?? owner.unlink_topic_id
    if (topicToLock) {
      await query(
        `/* unlinkTopicAlias lockTopic */
        SELECT id FROM topics
        WHERE id = $1 AND deleted_at IS NULL AND merged_into_topic_id IS NULL
        FOR UPDATE`,
        [topicToLock],
      )
    }
    const { rows: existingRows } = await query<LockedAlias>(
      `/* unlinkTopicAlias lock */
      SELECT
        topic_aliases.id,
        topic_aliases.topic_id,
        topic_aliases.alias,
        topic_aliases.unlink_topic_id,
        topic_aliases.unlink_requested_at,
        active_topic.slug AS active_topic_slug
      -- no-mistakes-disable-next-line postgres-required-predicates: merge moves alias ownership to destination; deleted_at remains checked
      FROM topic_aliases
      LEFT JOIN topics active_topic
        ON active_topic.id = topic_aliases.topic_id
        AND active_topic.deleted_at IS NULL
      WHERE topic_aliases.id = $1
      FOR UPDATE OF topic_aliases`,
      [aliasId],
    )
    const existing = existingRows[0]
    if (!existing) return null
    const sameOwner =
      existing.topic_id === owner.topic_id && existing.unlink_topic_id === owner.unlink_topic_id
    const acceptedConcurrently =
      owner.topic_id !== null &&
      existing.topic_id === null &&
      existing.unlink_topic_id === owner.topic_id &&
      existing.unlink_requested_at !== null
    assert(sameOwner || acceptedConcurrently, 409, 'Topic alias owner changed; retry the request')
    if (existing.unlink_requested_at) {
      assert(
        !options.expectedTopicId || existing.unlink_topic_id === options.expectedTopicId,
        409,
        'Topic alias is not linked to this topic',
      )
      await enqueueUnlinkPage(query, existing)
      return {
        alias: { id: existing.id, alias: existing.alias, topic_id: null },
        previousTopicId: existing.unlink_topic_id,
      }
    }
    assert(existing.alias !== existing.active_topic_slug, 409, 'Cannot unlink an active topic slug')
    assert(
      !options.expectedTopicId || existing.topic_id === options.expectedTopicId,
      409,
      'Topic alias is not linked to this topic',
    )
    if (!existing.topic_id) {
      return {
        alias: { id: existing.id, alias: existing.alias, topic_id: null },
        previousTopicId: null,
      }
    }
    const detachedTopicId = existing.topic_id
    await query(
      `/* unlinkTopicAlias mark */
      UPDATE topic_aliases
      SET topic_id = NULL,
          unlink_requested_at = COALESCE(unlink_requested_at, CURRENT_TIMESTAMP),
          unlink_topic_id = COALESCE(unlink_topic_id, $2::uuid)
      WHERE id = $1::uuid
        AND topic_id = $2::uuid
        AND unlink_requested_at IS NULL`,
      [aliasId, detachedTopicId],
    )
    if (options.revisedById) {
      await createTopicRevision(
        detachedTopicId,
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
    await recordTopicAliasPublicationChanges(query, [
      {
        aliasId: existing.id,
        alias: existing.alias,
        previousTopicId: detachedTopicId,
        nextTopicId: null,
      },
    ])
    await enqueueUnlinkPage(query, { id: existing.id, alias: existing.alias, topic_id: null })
    return {
      alias: { id: existing.id, alias: existing.alias, topic_id: null },
      previousTopicId: detachedTopicId,
    }
  }
  const result = await runInTransaction(options, run)
  if (result?.previousTopicId && !options.skipSideEffects) {
    await invalidate.topicsWithMetrics(result.previousTopicId, result.alias.alias)
  }
  return result?.alias ?? null
}

async function enqueueUnlinkPage(query: TransactionQuery, alias: TopicAlias): Promise<void> {
  const page = await selectTopicAliasUnlinkNextPage(
    query,
    alias.id,
    Boolean(normalizeHashtag(alias.alias)),
  )
  registerPostCommitAction(query, () =>
    awaitReportedEnqueueAdmission(() => enqueueTopicAliasUnlinkPage(page)),
  )
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
