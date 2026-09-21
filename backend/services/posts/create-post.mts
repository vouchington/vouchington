import type { TransactionQuery } from '@data-stores/psql'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from './types.mts'
import { preparePostWithCommunityReviews } from './create.mts'

export async function createPost(
  creator: PrivateUser,
  updates: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan = null,
  options: { query?: TransactionQuery } = {},
) {
  const prepared = await preparePostWithCommunityReviews(creator, updates, membershipPlan, options)
  return (await prepared.finalize()).post
}
