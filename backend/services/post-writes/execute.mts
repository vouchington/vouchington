import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { executePreparedContribution } from '@services/contribution-gating'
import { preparePostWrite } from './index.mts'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import type { CreatePostInput } from '@services/posts/types'

type AdmissionQuery = Parameters<typeof executePreparedContribution>[0]

export function executeCreatePostContribution(
  query: AdmissionQuery,
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  body: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan,
  options: { rssFeedItem?: ViewRssFeedItem } = {},
) {
  return executePreparedContribution(query, async () => {
    const prepared = await preparePostWrite(currentUser, provenance, body, membershipPlan, {
      query,
      ...options,
    })
    return {
      response: prepared.response.post,
      finalize: async () => (await prepared.finalize()).post,
    }
  })
}
