import type { TransactionQuery } from '@data-stores/psql/types'
import { createTopicRevision } from '@services/topic-revisions'
import assert from 'http-assert'
import { prepareTopicAliasInput } from './alias-preflight.mts'
import type { TopicAlias, TopicAliasOptions } from './alias-types.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { runTopicAliasTransaction } from './alias-transaction.mts'
import { finalizeClaimedTopicAliases } from './finalize-claimed-aliases.mts'

export { unlinkTopicAlias } from './delete-topic-aliases.mts'
export { createUnlinkedTopicAlias, createUnlinkedTopicAliases } from './create-unlinked-alias.mts'
export { finalizeClaimedTopicAliases } from './finalize-claimed-aliases.mts'
export { claimTopicAlias } from './claim-topic-alias.mts'
export { linkTopicAlias } from './link-topic-alias.mts'
export type { TopicAlias } from './alias-types.mts'

export async function createTopicAliases(
  topicId: string,
  aliases: string | string[],
  { skipSideEffects = false, revisedById = null, ...queryOptions }: TopicAliasOptions = {},
): Promise<TopicAlias[]> {
  const aliasArray = prepareTopicAliasInput(aliases)
  if (aliasArray.length === 0) return []
  const run = async (query: TransactionQuery) => {
    // lock-reason: prevents: a topic/alias lock-order deadlock between fn_project_topic_aliases and a slug or hostname change; writer: updateTopic
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
    const { rows: ownership } = await query<TopicAlias & { previous_topic_id: string | null }>(
      `/* createTopicAliases claimAll */
      INSERT INTO topic_aliases (topic_id, alias)
      SELECT topic.id, requested.alias
      FROM topics topic CROSS JOIN UNNEST($2::text[]) AS requested(alias)
      WHERE topic.id = $1 AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
      ORDER BY requested.alias
      ON CONFLICT (alias) DO UPDATE
      SET topic_id = EXCLUDED.topic_id
      WHERE topic_aliases.unlink_requested_at IS NULL
        AND (topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id)
      RETURNING WITH (OLD AS prior) id, topic_id, alias, prior.topic_id AS previous_topic_id`,
      [topicId, aliasArray],
    )
    const claimedKeys = new Set(ownership.map(claim => claim.alias))
    const conflictingAlias = aliasArray.find(alias => !claimedKeys.has(alias))
    assert(!conflictingAlias, 409, `Alias already belongs to another topic: ${conflictingAlias}`)
    await recordTopicAliasPublicationChanges(
      query,
      ownership.map(claim => ({
        aliasId: claim.id,
        alias: claim.alias,
        previousTopicId: claim.previous_topic_id,
        nextTopicId: claim.topic_id,
      })),
    )
    const claims = ownership.map(({ previous_topic_id, ...claim }) => claim)
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
