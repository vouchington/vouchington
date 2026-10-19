import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { PrivateUser } from '@services/users/types'
import { enqueueLanguageDetection } from '@queues/content-analysis/enqueues'
import onError from '@modules/on-error'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { currentUserCanUpdateCommunity } from './authorization.mts'
import type { CommunityMember } from './types.mts'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateAllCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { buildCommunityUpdateStatement, validateCommunityUpdateInput } from './update-input.mts'
import { communityUpdateReturning } from './community-update-returning.mts'
import { updateCommunityInTransaction } from './update-transaction.mts'
import type { UpdateCommunityInput } from './update-types.mts'
export type { UpdateCommunityInput } from './update-types.mts'

export async function updateCommunity(
  currentUser: PrivateUser,
  communityId: string,
  input: UpdateCommunityInput,
  membership?: CommunityMember | null,
  options?: QueryOptions & { community?: CommunityWithOwner },
): Promise<CommunityWithOwner> {
  const invalidatesMemberMetrics =
    input.visibility !== undefined || input.member_roster_visibility !== undefined
  const community = options?.community ?? (await getCommunity(communityId, options))
  assert(community, 404, 'Community not found')
  assert(currentUserCanUpdateCommunity(currentUser, community, membership), 403, 'Forbidden')

  validateCommunityUpdateInput(input)
  const updateStatement = communityUpdateReturning(
    sql`/* updateCommunity */`,
    buildCommunityUpdateStatement(communityId, input),
  )
  const run = (query: TransactionQuery) =>
    updateCommunityInTransaction({
      community,
      communityId,
      actorUserId: currentUser.id,
      update: input,
      statement: updateStatement,
      query,
    })

  let outcome: Awaited<ReturnType<typeof updateCommunityInTransaction>>
  try {
    if (options?.query || options?.client) {
      outcome = await withTransactionOptions(options, run)
    } else {
      await using transaction = await beginTransaction()
      outcome = await run(transaction)
      await transaction.commit()
      if ('profile_image_id' in input || 'banner_image_id' in input) {
        void enqueueReconcileMediaDeliveryRegistry()
      }
    }
  } catch (err) {
    const pgError = err as { code?: string }
    if (pgError.code === '23505') {
      throw createHttpError(409, `Slug "${input.slug}" is already taken`)
    }
    throw err
  }

  const updated = outcome.updated
  const priorCommunity = outcome.prior
  assert(updated, 404, 'Community not found after update')
  void addEntityBloomKeys('communities', [normalizeKey(updated.id), normalizeKey(updated.slug)])
  if (!options?.query) {
    await Promise.all([
      invalidate.communities(community, priorCommunity, updated),
      invalidatesMemberMetrics
        ? invalidateAllCommunityMemberUserMetrics(communityId)
        : Promise.resolve(),
    ])
    if ((priorCommunity?.visibility ?? community.visibility) !== updated.visibility)
      void enqueueRefreshTopHashtags()
  }
  // Language detection is asynchronous enrichment; the committed community update remains durable.
  void enqueueLanguageDetection('community', updated.id).catch(onError)
  return updated
}
