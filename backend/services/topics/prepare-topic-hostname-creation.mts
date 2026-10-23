import type { TransactionQuery } from '@data-stores/psql'
import type { CreateTopicUpdates } from './types.mts'
import {
  lockHostnameOwnership,
  lockTopicHostnameMutations,
} from '@services/urls-hostnames/ownership-lock'
import { lockTopicHostnameOwnership } from './hostname-ownership-lock.mts'
import { prepareHostnameForOwnedMutation } from './resolve-hostname.mts'
import sql from 'sql-template-strings'
import { lockExistingTopicAliasPublicationScopes } from './alias-publication-locks.mts'

export async function prepareTopicHostnameCreation(
  creatorId: string,
  updates: CreateTopicUpdates,
  options: { query: TransactionQuery },
) {
  // A revival can clear its old primary link; stabilize that identity before hostname locks.
  const { rows: revivalRows } = updates.source_topic_alias_id
    ? await options.query<{ id: string }>(sql`/* getTopicRevivalHostnameOwner */
        -- no-mistakes-disable-next-line postgres-required-predicates: capture potential revival identity including active, deleted, and merged owners.
        SELECT topic.id FROM topic_aliases source_alias
        JOIN topics topic ON topic.id = source_alias.topic_id
        WHERE source_alias.id = ${updates.source_topic_alias_id}
      `)
    : { rows: [] }
  const revivalIds = revivalRows.map(row => row.id)
  await lockTopicHostnameMutations(options.query, revivalIds)
  const hostnameId =
    updates.hostname !== undefined
      ? await prepareHostnameForOwnedMutation(creatorId, updates.hostname, options.query)
      : undefined
  if (revivalIds.length)
    await lockTopicHostnameOwnership(options.query, revivalIds, hostnameId ? [hostnameId] : [])
  else await lockHostnameOwnership(options.query, hostnameId ? [hostnameId] : [])

  await lockExistingTopicAliasPublicationScopes(
    options.query,
    [updates.slug],
    updates.source_topic_alias_id ? [updates.source_topic_alias_id] : [],
  )
  return { hostnameId, revivalIds }
}
