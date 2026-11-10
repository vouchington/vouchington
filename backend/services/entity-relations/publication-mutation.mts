import { recomputeRegisteredPostHackerNewsFlags } from './post-hacker-news-flag-registry.mts'
import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { UpsertEntityRelationsOptions } from './upsert-helpers-types.mts'
import { recordPostTopicRelationPublicationChanges } from './post-topic-publication.mts'
import { lockActiveUserSubjectsForMutation } from '@services/user-deletions/active-user-mutation-lock'
import {
  getHostnamePolicyGroups,
  getLocalHostnamePolicies,
} from '@services/urls-hostnames/policies'
import { getEntityRelationUrlTables } from './url-tables.mts'
import assert from 'http-assert'
import { lockHostnameOwnershipForUrls } from '@services/urls-hostnames/ownership-lock'

type PublicationMutationOptions = UpsertEntityRelationsOptions

export async function runRelationPublicationMutation<
  T extends { subject_id: string; object_id: string; newly_active?: boolean },
>(
  options: PublicationMutationOptions | undefined,
  relationTable: string,
  mutationKind: 'activate' | 'delete',
  objectIds: readonly string[],
  activeUserSubjectIds: readonly string[],
  mutation: (query: TransactionQuery) => Promise<T[]>,
): Promise<T[]> {
  const run = async (query: TransactionQuery): Promise<T[]> => {
    if (
      mutationKind === 'activate' &&
      getEntityRelationUrlTables().includes(relationTable) &&
      (relationTable === 'relation__topic__landing_page__url' ||
        options?.skipBlockedHostnameGuard !== true)
    ) {
      const hostnames = await lockHostnameOwnershipForUrls(query, objectIds)
      const policies = await getLocalHostnamePolicies(getHostnamePolicyGroups(hostnames), {
        query,
      })
      assert(
        ![...policies.values()].some(policy => policy.is_blocked),
        422,
        'URL hostname is blocked',
      )
    }
    await lockActiveUserSubjectsForMutation(query, activeUserSubjectIds)
    const capturePublication = options?.capturePublication !== false
    await options?.postMutationGuard?.assertAllowed(query)
    const changes = await mutation(query)
    if (!capturePublication && relationTable === 'relation__post__related__url') {
      await recomputeRegisteredPostHackerNewsFlags(
        changes.flatMap(change => (change.newly_active === false ? [] : [change.subject_id])),
        { query },
      )
    }
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
