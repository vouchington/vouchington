import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import type { TopicAlias } from './alias-types.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'

export async function claimTopicAlias(
  topicId: string,
  alias: string,
  options: QueryOptions = {},
): Promise<TopicAlias> {
  const normalizedAlias = normalizeKey(alias)
  assert(normalizedAlias.length > 0 && normalizedAlias.length <= 255, 422, 'Invalid topic alias')
  const run = async (query: TransactionQuery): Promise<TopicAlias> => {
    const { rows } = await query<TopicAlias & { previous_topic_id: string | null }>(
      `/* claimTopicAlias */
      INSERT INTO topic_aliases (topic_id, alias)
      SELECT topic.id, $2
      FROM topics topic
      WHERE topic.id = $1 AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
      ON CONFLICT (alias) DO UPDATE
      SET topic_id = EXCLUDED.topic_id
      WHERE topic_aliases.unlink_requested_at IS NULL
        AND (topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id)
      RETURNING WITH (OLD AS prior) id, topic_id, alias, prior.topic_id AS previous_topic_id
    `,
      [topicId, normalizedAlias],
    )
    const row = rows[0]
    assert(row, 409, `Alias already belongs to another topic: ${normalizedAlias}`)
    const { previous_topic_id: previousTopicId, ...claimedAlias } = row
    await recordTopicAliasPublicationChanges(query, [
      {
        aliasId: claimedAlias.id,
        alias: claimedAlias.alias,
        previousTopicId,
        nextTopicId: claimedAlias.topic_id,
      },
    ])
    return claimedAlias
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
