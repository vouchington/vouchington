import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  isRssFeedItemTopicAliasPublicationRelationTable,
  isPostScopedPublicationRelationTable,
  isTopicPublisherTypePublicationRelationTable,
  recordPostTopicRelationPublicationChanges,
} from './post-topic-publication.mts'
import {
  lockPostPublicationPostScopes,
  lockTopicRssFeedPublicationScopes,
  lockTopicAliasPublicationScopes,
} from '@services/post-publication'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'

type PublicationMutationOptions = QueryOptions & { capturePublication?: boolean }

export async function runRelationPublicationMutation<
  T extends { subject_id: string; object_id: string; newly_active?: boolean },
>(
  options: PublicationMutationOptions | undefined,
  relationTable: string,
  subjectIds: readonly string[],
  objectIds: readonly string[],
  activeUserSubjectIds: readonly string[],
  mutation: (query: TransactionQuery) => Promise<T[]>,
): Promise<T[]> {
  const run = async (query: TransactionQuery): Promise<T[]> => {
    await lockActiveUserSubjectsForMutation(query, activeUserSubjectIds)
    const capturePublication = options?.capturePublication !== false
    if (capturePublication && isPostScopedPublicationRelationTable(relationTable))
      await lockPostPublicationPostScopes(query, subjectIds)
    if (capturePublication && isRssFeedItemTopicAliasPublicationRelationTable(relationTable))
      await lockTopicAliasPublicationScopes(query, objectIds)
    if (capturePublication && isTopicPublisherTypePublicationRelationTable(relationTable))
      await lockTopicRssFeedPublicationScopes(query, subjectIds)
    const changes = await mutation(query)
    if (capturePublication)
      await recordPostTopicRelationPublicationChanges(
        query,
        relationTable,
        changes.filter(change => change.newly_active !== false),
      )
    return changes
  }
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const changes = await run(transaction)
  await transaction.commit()
  return changes
}
