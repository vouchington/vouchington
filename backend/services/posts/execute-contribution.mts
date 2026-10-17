import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { executePreparedContribution } from '@services/contribution-gating'
import { preparePostWithCommunityReviews } from './create.mts'
import type { CreatePostInput } from './types.mts'
import type { CreatePostDefaults } from './create/validation.mts'

type AdmissionQuery = Parameters<typeof executePreparedContribution>[0]

export function executeCreatePostContribution(
  query: AdmissionQuery,
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  body: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan,
  validatedDefaults?: CreatePostDefaults,
) {
  return executePreparedContribution(query, async () => {
    const prepared = await preparePostWithCommunityReviews(
      currentUser,
      provenance,
      body,
      membershipPlan,
      { query, validatedDefaults },
    )
    return {
      response: prepared.response.post,
      finalize: async () => (await prepared.finalize()).post,
    }
  })
}
