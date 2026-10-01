import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { TransactionQuery } from '@data-stores/psql'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from './types.mts'
import { preparePostWithCommunityReviews } from './prepare-post-with-community-reviews.mts'

export async function createPost(
  creator: PrivateUser,
  provenance: ContentProvenance,
  updates: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan = null,
  options: { query?: TransactionQuery } = {},
) {
  const prepared = await preparePostWithCommunityReviews(
    creator,
    provenance,
    updates,
    membershipPlan,
    options,
  )
  return (await prepared.finalize()).post
}
