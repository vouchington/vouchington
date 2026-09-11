import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { enqueueBulkTopicAliasesUpdate } from '@queues/topic-aliases/enqueues'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import { createTopicRevision } from '@services/topic-revisions'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'
import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import { prepareTopicAliasInput } from './alias-preflight.mts'
import type { TopicAlias, TopicAliasOptions } from './alias-types.mts'
import { invalidatePostsForTopicAliases } from './invalidate-posts-for-topic-aliases.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
export { unlinkTopicAlias } from './delete-topic-aliases.mts'
export { updateTopicAliasesField } from './update-aliases-field.mts'
export { createUnlinkedTopicAlias } from './create-unlinked-alias.mts'
import { updateTopicAliasesField } from './update-aliases-field.mts'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'
import { runTopicAliasTransaction } from './alias-transaction.mts'

export type { TopicAlias } from './alias-types.mts'
import { finalizeClaimedTopicAliases } from './finalize-claimed-aliases.mts'
export { finalizeClaimedTopicAliases } from './finalize-claimed-aliases.mts'

export { claimTopicAlias } from './claim-topic-alias.mts'
export async function linkTopicAlias(
  topicId: string,
  aliasId: string,
  options: TopicAliasOptions = {},
): Promise<TopicAlias> {
  let previousTopicId: string | null = null
  const run = async (query: TransactionQuery) => {
    await lockTopicAliasPublicationScopes(query, [aliasId])
    const { rows: topicRows } = await query<{ id: string; merged_into_topic_id: string | null }>(
      `/* linkTopicAlias lockTopic */
      -- no-mistakes-disable-next-line postgres-required-predicates: merged rows must be locked to preserve 409 conflict semantics
      SELECT id, merged_into_topic_id
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
    if (previousTopicId && previousTopicId !== topicId) {
      await updateTopicAliasesField(previousTopicId, { query, skipSideEffects: true })
    }
    await updateTopicAliasesField(topicId, { query, skipSideEffects: true })
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
    entityCacheBloomFilters.topics.add([normalizeKey(linkedAlias.alias)])
    const affectedTopicIds = previousTopicId ? [...new Set([previousTopicId, topicId])] : [topicId]
    await Promise.all([
      ...affectedTopicIds.map(id => invalidate.topics(id, linkedAlias.alias)),
      invalidate.topic_metrics(...affectedTopicIds),
      invalidatePostsForTopicAliases([linkedAlias.id]),
    ])
    void enqueueBulkTopicAliasesUpdate(affectedTopicIds)
  }
  return linkedAlias
}

export async function createTopicAliases(
  topicId: string,
  aliases: string | string[],
  {
    skipSideEffects = false,
    revisedById = null,
    ...queryOptions
  }: { skipSideEffects?: boolean; revisedById?: string | null } & QueryOptions = {},
): Promise<TopicAlias[]> {
  const aliasArray = prepareTopicAliasInput(aliases)
  if (aliasArray.length === 0) return []
  const run = async (query: TransactionQuery) => {
    const existingAliasIds = await lockExistingTopicAliasPublicationScopes(query, aliasArray)
    const { rows: topicRows } = await query<{ id: string; merged_into_topic_id: string | null }>(
      `/* createTopicAliases lockTopic */
      -- no-mistakes-disable-next-line postgres-required-predicates: merged rows must be locked to preserve 409 conflict semantics
      SELECT id, merged_into_topic_id
      FROM topics
      WHERE id = $1 AND deleted_at IS NULL
      FOR UPDATE`,
      [topicId],
    )
    const topic = topicRows[0]
    assert(topic, 404, 'Topic not found')
    assert(!topic.merged_into_topic_id, 409, 'Cannot add aliases to a merged topic')
    const { rows: existingAliases } = await query<Pick<TopicAlias, 'id' | 'topic_id' | 'alias'>>(
      `/* createTopicAliases lockExisting */
      SELECT id, topic_id, alias
      FROM topic_aliases
      WHERE alias = ANY($1::text[])
      ORDER BY alias
      FOR UPDATE`,
      [aliasArray],
    )
    assert(
      existingAliases.every(existing => existingAliasIds.get(existing.alias) === existing.id),
      409,
      'Topic aliases changed while acquiring publication scopes; retry the request',
    )
    const existingAliasesByKey = new Map(
      existingAliases.map(existing => [existing.alias, existing]),
    )
    const { rows: claims } = await query<TopicAlias>(
      `/* createTopicAliases claimAll */
      INSERT INTO topic_aliases (topic_id, alias)
      SELECT $1::uuid, alias FROM UNNEST($2::text[]) AS alias
      ORDER BY alias
      ON CONFLICT (alias) DO UPDATE
      SET topic_id = EXCLUDED.topic_id
      WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id
      RETURNING id, topic_id, alias`,
      [topicId, aliasArray],
    )
    const claimedKeys = new Set(claims.map(claim => claim.alias))
    const conflictingAlias = aliasArray.find(alias => !claimedKeys.has(alias))
    assert(!conflictingAlias, 409, `Alias already belongs to another topic: ${conflictingAlias}`)
    await recordTopicAliasPublicationChanges(
      query,
      claims.flatMap(claim => {
        const existingAlias = existingAliasesByKey.get(claim.alias)
        return [
          {
            aliasId: claim.id,
            alias: claim.alias,
            previousTopicId: existingAlias?.topic_id ?? null,
            nextTopicId: claim.topic_id,
          },
        ]
      }),
    )
    await updateTopicAliasesField(topicId, { query, skipSideEffects: true })
    if (revisedById) {
      await createTopicRevision(
        topicId,
        'update',
        {
          topic_alias_link: { before: null, after: claims.map(({ id, alias }) => ({ id, alias })) },
        },
        revisedById,
        { query },
      )
    }
    return claims
  }
  const claimedAliases = await runTopicAliasTransaction(queryOptions, run)
  if (skipSideEffects) return claimedAliases
  await finalizeClaimedTopicAliases(topicId, claimedAliases)
  return claimedAliases
}
