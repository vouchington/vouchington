import { getCommunities } from '@/lib/api/server'
import type { PostType } from '@/types/posts'
import type { CommunityPostOption } from './types'

type CommunityRootPostType = Extract<PostType, 'discussion' | 'review' | 'data_point'>

const COMMUNITY_OPTIONS_LIMIT = 100

export async function getEligibleCommunityPostOptions(
  postType: CommunityRootPostType,
  requestedSlug?: string,
): Promise<{
  communityOptions: CommunityPostOption[]
  initialCommunitySlug?: string
}> {
  const communityOptions = await loadEligibleCommunityOptions(postType).catch(() => [])
  return {
    communityOptions,
    initialCommunitySlug: communityOptions.some(community => community.slug === requestedSlug)
      ? requestedSlug
      : undefined,
  }
}

async function loadEligibleCommunityOptions(
  postType: CommunityRootPostType,
  after?: string,
  accumulated: CommunityPostOption[] = [],
): Promise<CommunityPostOption[]> {
  const response = await getCommunities({
    searchParams: {
      eligible_post_type: postType,
      limit: COMMUNITY_OPTIONS_LIMIT,
      ...(after ? { after } : {}),
    },
  })

  const options = [
    ...accumulated,
    ...(response.results ?? []).flatMap(result => {
      const community = response.communities?.[result.id]
      return community
        ? [
            {
              id: community.id,
              name: community.name,
              slug: community.slug,
              visibility: community.visibility,
              post_approval_required_at: community.post_approval_required_at,
            },
          ]
        : []
    }),
  ]

  return response.page_info?.has_next_page && response.page_info?.end_cursor
    ? loadEligibleCommunityOptions(postType, response.page_info.end_cursor, options)
    : options
}
