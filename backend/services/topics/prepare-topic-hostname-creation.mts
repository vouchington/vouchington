import type { TransactionQuery } from '@data-stores/psql'
import type { CreateTopicUpdates } from './types.mts'
import { prepareHostnameForOwnedMutation } from './resolve-hostname.mts'
import sql from 'sql-template-strings'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'

export async function prepareTopicHostnameCreation(
  creatorId: string,
  updates: CreateTopicUpdates,
  options: { query: TransactionQuery },
) {
  const { rows: revivalRows } = updates.source_topic_alias_id
    ? await options.query<{ id: string }>(sql`/* getTopicRevivalHostnameOwner */
        SELECT topic.id FROM topic_aliases source_alias
        JOIN topics topic ON topic.id = source_alias.topic_id
        WHERE source_alias.id = ${updates.source_topic_alias_id}
      `)
    : { rows: [] }
  const revivalIds = revivalRows.map(row => row.id)
  const hostnameId =
    updates.hostname !== undefined
      ? await prepareHostnameForOwnedMutation(creatorId, updates.hostname, options.query)
      : undefined

  await lockExistingTopicAliasPublicationScopes(
    options.query,
    [updates.slug],
    updates.source_topic_alias_id ? [updates.source_topic_alias_id] : [],
  )
  return { hostnameId, revivalIds }
}
