import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanDeleteCommunity } from './authorization.mts'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import type { CommunityMember } from './types.mts'
import { updateCommunity, type UpdateCommunityInput } from './update.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateAllCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordPostPublicationChange } from '@services/post-publication'

type UpdateCommunityAndSetArchiveStateDependencies = {
  invalidateCommunities: typeof invalidate.communities
  invalidateAllCommunityMemberUserMetrics: typeof invalidateAllCommunityMemberUserMetrics
}

const updateCommunityAndSetArchiveStateDependencies: UpdateCommunityAndSetArchiveStateDependencies =
  {
    invalidateCommunities: invalidate.communities,
    invalidateAllCommunityMemberUserMetrics,
  }

export async function archiveCommunity(
  communityId: string,
  archivedById: string | null,
  options?: QueryOptions,
): Promise<void> {
  const run = async (query: TransactionQuery): Promise<void> => {
    const { rowCount } = await query(
      `/* archiveCommunity */
      UPDATE communities
      SET archived_at = CURRENT_TIMESTAMP,
          archived_by_id = $1
      WHERE id = $2
        AND deleted_at IS NULL
        AND archived_at IS NULL`,
      [archivedById, communityId],
    )
    if ((rowCount ?? 0) > 0) {
      await recordPostPublicationChange(query, {
        scope: { type: 'community', communityId },
        reason: 'community_visibility_changed',
        impactedCommunityIds: [communityId],
        footprint: { priorCommunityId: communityId },
      })
    }
  }
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}

export async function unarchiveCommunity(
  communityId: string,
  options?: QueryOptions,
): Promise<void> {
  const run = async (query: TransactionQuery): Promise<void> => {
    const { rowCount } = await query(
      `/* unarchiveCommunity */
      UPDATE communities
      SET archived_at = NULL,
          archived_by_id = NULL
      WHERE id = $1
        AND deleted_at IS NULL
        AND archived_at IS NOT NULL`,
      [communityId],
    )
    if ((rowCount ?? 0) > 0) {
      await recordPostPublicationChange(query, {
        scope: { type: 'community', communityId },
        reason: 'community_visibility_changed',
        impactedCommunityIds: [communityId],
        footprint: { priorCommunityId: communityId },
      })
    }
  }
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  await run(transaction)
  await transaction.commit()
}

export async function setCommunityArchiveState(
  currentUser: PrivateUser,
  communityId: string,
  archive: boolean,
  membership?: CommunityMember | null,
  community?: CommunityWithOwner,
  options?: QueryOptions,
): Promise<CommunityWithOwner> {
  const currentCommunity = community ?? (await getCommunity(communityId, options))
  assert(currentCommunity, 404, 'Community not found')
  assert(currentUserCanDeleteCommunity(currentUser, currentCommunity, membership), 403, 'Forbidden')

  if (archive) {
    assert(!currentCommunity.archived_at, 409, 'Community is already archived')
    await archiveCommunity(communityId, currentUser.id, options)
  } else {
    await unarchiveCommunity(communityId, options)
  }

  const updated = await getCommunity(communityId, options)
  assert(updated, 404, 'Community not found after archive update')
  if (!options?.query) {
    await invalidate.communities(currentCommunity, updated)
    if (Boolean(currentCommunity.archived_at) !== Boolean(updated.archived_at)) {
      void enqueueRefreshTopHashtags()
    }
  }
  return updated
}

export async function updateCommunityAndSetArchiveState(
  currentUser: PrivateUser,
  communityId: string,
  input: UpdateCommunityInput,
  archive: boolean,
  membership?: CommunityMember | null,
  dependencies: Partial<UpdateCommunityAndSetArchiveStateDependencies> = updateCommunityAndSetArchiveStateDependencies,
): Promise<CommunityWithOwner> {
  await using transaction = await beginTransaction()
  const currentCommunity = await getCommunity(communityId, { query: transaction })
  assert(currentCommunity, 404, 'Community not found')
  const community = await updateCommunity(currentUser, communityId, input, membership, {
    query: transaction,
  })
  const updated = await setCommunityArchiveState(
    currentUser,
    communityId,
    archive,
    membership,
    community,
    { query: transaction },
  )
  await transaction.commit()
  await Promise.all([
    (dependencies.invalidateCommunities ?? invalidate.communities)(currentCommunity, updated),
    input.visibility !== undefined || input.member_roster_visibility !== undefined
      ? (
          dependencies.invalidateAllCommunityMemberUserMetrics ??
          invalidateAllCommunityMemberUserMetrics
        )(communityId)
      : Promise.resolve(),
  ])
  if (
    currentCommunity.visibility !== updated.visibility ||
    Boolean(currentCommunity.archived_at) !== Boolean(updated.archived_at)
  ) {
    void enqueueRefreshTopHashtags()
  }
  return updated
}
