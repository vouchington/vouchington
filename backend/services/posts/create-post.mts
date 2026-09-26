import type { TransactionQuery } from '@data-stores/psql'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import type { PrivateUser } from '@services/users/types'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { CreatePostInput } from './types.mts'
import { preparePostWithCommunityReviews } from './create.mts'

export async function createPost(
  provenance: ContentProvenance,
  creator: PrivateUser,
  updates: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan = null,
  options: { query?: TransactionQuery } = {},
) {
  const prepared = await preparePostWithCommunityReviews(
    provenance,
    creator,
    updates,
    membershipPlan,
    options,
  )
  return (await prepared.finalize()).post
}
