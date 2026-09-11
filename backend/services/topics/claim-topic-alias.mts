import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { normalizeKey } from '@ts-shared/utils/strings'
import assert from 'http-assert'
import type { TopicAlias } from './alias-types.mts'
import { recordTopicAliasPublicationChanges } from './publication-change.mts'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'

export async function claimTopicAlias(
  topicId: string,
  alias: string,
  options: QueryOptions = {},
): Promise<TopicAlias> {
  const normalizedAlias = normalizeKey(alias)
  assert(normalizedAlias.length > 0 && normalizedAlias.length <= 255, 422, 'Invalid topic alias')
  const run = async (query: TransactionQuery): Promise<TopicAlias> => {
    const existingAliasIds = await lockExistingTopicAliasPublicationScopes(query, [normalizedAlias])
    const { rows: existingRows } = await query<Pick<TopicAlias, 'id' | 'topic_id'>>(
      `/* claimTopicAlias lockExisting */
      SELECT id, topic_id
      FROM topic_aliases
      WHERE alias = $1
      FOR UPDATE`,
      [normalizedAlias],
    )
    const existingAlias = existingRows[0]
    assert(
      !existingAlias || existingAliasIds.get(normalizedAlias) === existingAlias.id,
      409,
      'Topic alias changed while acquiring publication scope; retry the request',
    )
    const { rows } = await query<TopicAlias>(
      `/* claimTopicAlias */
      INSERT INTO topic_aliases (topic_id, alias)
      VALUES ($1, $2)
      ON CONFLICT (alias) DO UPDATE
      SET topic_id = EXCLUDED.topic_id
      WHERE topic_aliases.topic_id IS NULL OR topic_aliases.topic_id = EXCLUDED.topic_id
      RETURNING id, topic_id, alias
    `,
      [topicId, normalizedAlias],
    )
    const claimedAlias = rows[0]
    assert(claimedAlias, 409, `Alias already belongs to another topic: ${normalizedAlias}`)
    await recordTopicAliasPublicationChanges(query, [
      {
        aliasId: claimedAlias.id,
        alias: claimedAlias.alias,
        previousTopicId: existingAlias?.topic_id ?? null,
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
