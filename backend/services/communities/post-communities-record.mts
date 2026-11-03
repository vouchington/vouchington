import { getCommunitiesByIdBatch } from './get-batch.mts'

type PostWithCommunityId = {
  community_id?: string | null
}

export async function getPostCommunitiesRecord(posts: Array<PostWithCommunityId | null>) {
  const communityIds = [
    ...new Set(
      posts.flatMap(post =>
        typeof post?.community_id === 'string' && post.community_id.length > 0
          ? [post.community_id]
          : [],
      ),
    ),
  ]
  if (communityIds.length === 0) return {}
  const communities = await getCommunitiesByIdBatch(communityIds)
  return Object.fromEntries(
    communities.flatMap(community =>
      community
        ? [[community.id, { id: community.id, name: community.name, slug: community.slug }]]
        : [],
    ),
  )
}
