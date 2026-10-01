import { getPublicUserByIdOrSlug } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import {
  getPostByAnyCached,
  getRssFeedByIdCached,
  getTopicByAnyWithRedirectCached,
  getUrlByAnyCached,
  getUrlHostnameByAnyCached,
} from '@services/entity-fetch'
import { canViewPost, BLOCKED_POST_TYPES } from '@services/posts'
import { getRssFeedItemById } from '@services/rss-feed-items'
import { loadCommunityForViewerOrApplicant } from '@services/communities'
import { currentUserCanFilterHostnameModeration } from '@services/urls-hostnames'
import type { EntityRelationEntityType } from '@services/entity-relations/config'

/** Match the target visibility used by each entity detail route before creating a bookmark. */
export async function currentUserCanBookmarkTarget(
  currentUser: PrivateUser,
  entityType: EntityRelationEntityType,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case 'post': {
      const post = await getPostByAnyCached(entityId)
      if (!post || post.deleted_at || BLOCKED_POST_TYPES.has(post.post_type)) return false
      const rootPost = await getPostByAnyCached(post.root_id ?? post.id)
      if (!rootPost || rootPost.deleted_at || BLOCKED_POST_TYPES.has(rootPost.post_type)) {
        return false
      }
      return canViewPost(currentUser, post)
    }
    case 'topic':
      return !!(await getTopicByAnyWithRedirectCached(entityId))
    case 'user':
      return !!(await getPublicUserByIdOrSlug(entityId))
    case 'rss_feed':
      return !!(await getRssFeedByIdCached(entityId))
    case 'rss_feed_item':
      return !!(await getRssFeedItemById(entityId))
    case 'url': {
      const url = await getUrlByAnyCached(entityId)
      return (
        !!url && (!url.hostname?.blocked || currentUserCanFilterHostnameModeration(currentUser))
      )
    }
    case 'url_hostname': {
      const hostname = await getUrlHostnameByAnyCached(entityId)
      return (
        !!hostname && (!hostname.blocked || currentUserCanFilterHostnameModeration(currentUser))
      )
    }
    case 'community':
      return canLoadBookmarkCommunity(() =>
        loadCommunityForViewerOrApplicant(currentUser, entityId),
      )
    default:
      return false
  }
}

export async function canLoadBookmarkCommunity(load: () => Promise<unknown>): Promise<boolean> {
  try {
    await load()
    return true
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
    if (status === 404) return false
    throw error
  }
}
