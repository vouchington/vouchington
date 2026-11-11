import { indexById } from '@modules/utils'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import type { Post } from '@services/posts/types'

/** Resolve recommendation reviewers for a page, including the one-post detail page. */
export async function getRecommendationReviewerUsers(posts: Array<Post | null | undefined>) {
  const ids = [
    ...new Set(
      posts.flatMap(post => {
        const id = post?.topic_recommendation?.reviewed_by_id
        return id ? [id] : []
      }),
    ),
  ]
  if (!ids.length) return undefined
  const users = (await getUserPublicByAnyCachedBatch(ids)).filter(Boolean)
  return users.length ? indexById(users) : undefined
}
