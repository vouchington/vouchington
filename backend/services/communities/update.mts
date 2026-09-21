import { beginTransaction, withTransactionOptions } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { normalizeKey } from '@ts-shared/utils/strings'
import type { PrivateUser } from '@services/users/types'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import onError from '@modules/on-error'
import { getCommunity, type CommunityWithOwner } from './get.mts'
import { currentUserCanUpdateCommunity } from './authorization.mts'
import type {
  CommunityListType,
  CommunityMember,
  CommunityMemberRosterVisibility,
  CommunityVisibility,
} from './types.mts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import { invalidateAllCommunityMemberUserMetrics } from './members/invalidate-user-metrics.mts'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { buildCommunityUpdateStatement, validateCommunityUpdateInput } from './update-input.mts'
import { updateCommunityInTransaction } from './update-transaction.mts'

export type UpdateCommunityInput = {
  name?: string
  slug?: string
  markdown?: string | null
  visibility?: CommunityVisibility
  member_roster_visibility?: CommunityMemberRosterVisibility
  list_type?: CommunityListType | null
  member_invites_allowed_at?: Date | null
  post_approval_required_at?: Date | null
  profile_image_id?: string | null
  banner_image_id?: string | null
  default_language?: string | null
}

export async function updateCommunity(
  currentUser: PrivateUser,
  communityId: string,
  input: UpdateCommunityInput,
  membership?: CommunityMember | null,
  options?: QueryOptions,
): Promise<CommunityWithOwner> {
  const invalidatesMemberMetrics =
    input.visibility !== undefined || input.member_roster_visibility !== undefined
  const community = await getCommunity(communityId, options)
  assert(community, 404, 'Community not found')
  assert(currentUserCanUpdateCommunity(currentUser, community, membership), 403, 'Forbidden')

  validateCommunityUpdateInput(input)
  const updateStatement = buildCommunityUpdateStatement(communityId, input)
  const run = (query: TransactionQuery) =>
    updateCommunityInTransaction({
      community,
      communityId,
      update: input,
      statement: updateStatement,
      query,
    })

  try {
    if (options?.query || options?.client) {
      await withTransactionOptions(options, run)
    } else {
      await using transaction = await beginTransaction()
      await run(transaction)
      await transaction.commit()
      if ('profile_image_id' in input || 'banner_image_id' in input) {
        void enqueueReconcileMediaDeliveryRegistry()
      }
    }
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      throw createHttpError(409, `Slug "${input.slug}" is already taken`)
    }
    throw error
  }

  const updated = await getCommunity(communityId, options)
  assert(updated, 404, 'Community not found after update')
  entityCacheBloomFilters.communities.add([normalizeKey(updated.id), normalizeKey(updated.slug)])
  if (!options?.query) {
    await Promise.all([
      invalidate.communities(community, updated),
      invalidatesMemberMetrics
        ? invalidateAllCommunityMemberUserMetrics(communityId)
        : Promise.resolve(),
    ])
    if (community.visibility !== updated.visibility) void enqueueRefreshTopHashtags()
  }
  // Language detection is asynchronous enrichment; the committed community update remains durable.
  void enqueueLanguageDetection('community', updated.id).catch(onError)
  return updated
}
