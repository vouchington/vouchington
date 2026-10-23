import type { TransactionQuery } from '@data-stores/psql/types'
import { createTopicRevision } from '@services/topic-revisions'
import { lockTopicRssFeedAttachmentLifecycle } from '@services/post-publication'
import assert from 'http-assert'
import { prepareTopicAliasInput } from './alias-preflight.mts'
import type { TopicAlias, CreateTopicAliasOptions } from './alias-types.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'
import { runTopicAliasTransaction } from './alias-transaction.mts'
import { finalizeClaimedTopicAliases } from './finalize-claimed-aliases.mts'

export { unlinkTopicAlias } from './delete-topic-aliases.mts'
export { createUnlinkedTopicAlias } from './create-unlinked-alias.mts'
export { finalizeClaimedTopicAliases } from './finalize-claimed-aliases.mts'
export { claimTopicAlias } from './claim-topic-alias.mts'
export { linkTopicAlias } from './link-topic-alias.mts'
export type { TopicAlias } from './alias-types.mts'

export async function createTopicAliases(
  topicId: string,
  aliases: string | string[],
  {
    skipSideEffects = false,
    revisedById = null,
    preparedPublicationScopes,
    ...queryOptions
  }: CreateTopicAliasOptions = {},
): Promise<TopicAlias[]> {
  const aliasArray = prepareTopicAliasInput(aliases)
  if (aliasArray.length === 0) return []
  const run = async (query: TransactionQuery) => {
    assert(
      !preparedPublicationScopes || preparedPublicationScopes.query === query,
      500,
      'Prepared alias scopes require their original transaction',
    )
    const existingAliasIds =
      preparedPublicationScopes?.aliasIds ??
      (await lockExistingTopicAliasPublicationScopes(query, aliasArray))
    await lockTopicRssFeedAttachmentLifecycle(query, topicId)
    const { rows: topicRows } = await query<{ id: string; merged_into_topic_id: string | null }>(
      `/* createTopicAliases lockTopic */
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
