import * as Sentry from '@sentry/nextjs'

import { getCommunity, getCommunityPinnedPosts } from '@/lib/api/server'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function loadPostCommunityPinState(postCommunity: { slug: string } | null) {
  const currentUser = await getCurrentUser()
  if (!postCommunity || !currentUser) {
    return { currentUser, communityData: null, pinnedPostsData: null }
  }
  const [communityData, pinnedPostsData] = await Promise.all([
    returnNullForMissingEntity(getCommunity(postCommunity.slug), {
      nullStatusCodes: [403, 404],
    }).catch((err: unknown) => {
      // Community data is auxiliary for pin eligibility — log 5xx but don't fail the page
      Sentry.captureException(err, { tags: { context: 'community-data-for-pin' } })
      return null
    }),
    returnNullForMissingEntity(getCommunityPinnedPosts(postCommunity.slug), {
      nullStatusCodes: [403, 404],
    }).catch((err: unknown) => {
      // Pin state is auxiliary — log unexpected errors (5xx, network) but don't fail the page
      Sentry.captureException(err, { tags: { context: 'community-pinned-posts' } })
      return null
    }),
  ])
  return { currentUser, communityData, pinnedPostsData }
}
