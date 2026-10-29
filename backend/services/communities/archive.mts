import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanDeleteCommunity } from './authorization.mts'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import type { CommunityMember } from './types.mts'
import { writeCommunitiesUpdate, writeCommunityUpdate } from './community-update-returning.mts'
import { updateCommunity, type UpdateCommunityInput } from './update.mts'
import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueCommunityMemberMetricInvalidationBestEffort } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import {
  recordPostPublicationChange,
  recordPostPublicationChangeBatch,
} from '@services/post-publication'

type UpdateCommunityAndSetArchiveStateDependencies = {
  invalidateCommunities: typeof invalidate.communities
  enqueueCommunityMemberMetricInvalidationBestEffort: typeof enqueueCommunityMemberMetricInvalidationBestEffort
}

const updateCommunityAndSetArchiveStateDependencies: UpdateCommunityAndSetArchiveStateDependencies =
  {
    invalidateCommunities: invalidate.communities,
    enqueueCommunityMemberMetricInvalidationBestEffort,
  }

/** Archives every active community in one UPDATE and one publication-fence statement. */
export async function archiveCommunities(
  communityIds: readonly string[],
  archivedById: string | null,
  options?: QueryOptions,
): Promise<CommunityWithOwner[]> {
  if (communityIds.length === 0) return []
  const update = sql`
    UPDATE communities
    SET archived_at = CURRENT_TIMESTAMP, archived_by_id = ${archivedById}
    WHERE id = ANY(${[...communityIds]}::uuid[]) AND deleted_at IS NULL AND archived_at IS NULL`
  const run = async (query: TransactionQuery): Promise<CommunityWithOwner[]> => {
    const updated = await writeCommunitiesUpdate(sql`/* archiveCommunities */`, update, { query })
    await recordPostPublicationChangeBatch(
      query,
      updated.map(({ id }) => ({
        scope: { type: 'community', communityId: id },
        reason: 'community_visibility_changed',
        impactedCommunityIds: [id],
        footprint: { priorCommunityId: id },
      })),
    )
    return updated
  }
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const updated = await run(transaction)
  await transaction.commit()
  return updated
}

export async function unarchiveCommunity(
  communityId: string,
  options?: QueryOptions,
): Promise<CommunityWithOwner | null> {
  const update = sql`
    UPDATE communities
    SET archived_at = NULL, archived_by_id = NULL
    WHERE id = ${communityId} AND deleted_at IS NULL AND archived_at IS NOT NULL`
  const run = async (query: TransactionQuery): Promise<CommunityWithOwner | null> => {
    const updated = await writeCommunityUpdate(sql`/* unarchiveCommunity */`, update, { query })
    if (updated) {
      await recordPostPublicationChange(query, {
        scope: { type: 'community', communityId },
        reason: 'community_visibility_changed',
        impactedCommunityIds: [communityId],
        footprint: { priorCommunityId: communityId },
      })
    }
    return updated
  }
  if (options?.query || options?.client) return withTransactionOptions(options, run)
  await using transaction = await beginTransaction()
  const updated = await run(transaction)
  await transaction.commit()
  return updated
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

  if (archive) assert(!currentCommunity.archived_at, 409, 'Community is already archived')
  const written = archive
    ? ((await archiveCommunities([communityId], currentUser.id, options))[0] ?? null)
    : await unarchiveCommunity(communityId, options)
  const updated = written ?? (await getCommunity(communityId, { ...options, readOnly: false }))
  assert(updated, 404, 'Community not found after archive update')
  if (!options?.query && !options?.client) {
    const archiveChanged = Boolean(currentCommunity.archived_at) !== Boolean(updated.archived_at)
    await Promise.all([
      invalidate.communities(currentCommunity, updated),
      archiveChanged
        ? enqueueCommunityMemberMetricInvalidationBestEffort(communityId)
        : Promise.resolve(),
    ])
    if (archiveChanged) {
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
  loadedCommunity?: CommunityWithOwner,
): Promise<CommunityWithOwner> {
  await using transaction = await beginTransaction()
  const currentCommunity =
    loadedCommunity ?? (await getCommunity(communityId, { query: transaction }))
  assert(currentCommunity, 404, 'Community not found')
  const community = await updateCommunity(currentUser, communityId, input, membership, {
    query: transaction,
    community: currentCommunity,
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
    input.visibility !== undefined ||
    input.member_roster_visibility !== undefined ||
    Boolean(currentCommunity.archived_at) !== Boolean(updated.archived_at)
      ? (
          dependencies.enqueueCommunityMemberMetricInvalidationBestEffort ??
          enqueueCommunityMemberMetricInvalidationBestEffort
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
