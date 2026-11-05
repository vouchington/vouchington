import { getPublicUserByIdOrSlug } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import {
  getRssFeedByIdCached,
  getTopicByAnyWithRedirectCached,
  getUrlByAnyCached,
  getUrlHostnameByAnyCached,
} from '@services/entity-fetch'
import { canViewPost, getRequestedPostReadState } from '@services/posts'
import { BLOCKED_POST_TYPES } from '@voucha/types/entities/post'
import { getRoutePostByAnyCached } from '@services/posts/route-access'
import { getRssFeedItemById } from '@services/rss-feed-items'
import { loadCommunityForViewerOrApplicant } from '@services/communities'
import { currentUserCanFilterHostnameModeration } from '@services/urls-hostnames'
import type { EntityRelationEntityType } from '@services/entity-relations/config'

/**
 * Match the target visibility used by each entity detail route before creating a bookmark. The one
 * exception is `hide` on a comment, which only collapses it in the thread: a deleted or unmoderated
 * comment is shown as a placeholder, so it can be collapsed and expanded like any other.
 */
export async function currentUserCanBookmarkTarget(
  currentUser: PrivateUser,
  entityType: EntityRelationEntityType,
  entityId: string,
  predicate: string,
): Promise<boolean> {
  switch (entityType) {
    case 'post': {
      const { post, root } = await getRoutePostByAnyCached(entityId, { includeDeleted: true })
      if (!post || BLOCKED_POST_TYPES.has(post.post_type)) return false
      const rootPost = post.root_post_id ? root : post
      if (!rootPost || rootPost.deleted_at || BLOCKED_POST_TYPES.has(rootPost.post_type)) {
        return false
      }
      if (post.post_type === 'comment' && predicate === 'hide') {
        return (await getRequestedPostReadState(currentUser, post, root)) !== null
      }
      return !post.deleted_at && (await canViewPost(currentUser, post))
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
        !!url && (!url.hostname?.is_blocked || currentUserCanFilterHostnameModeration(currentUser))
      )
    }
    case 'url_hostname': {
      const hostname = await getUrlHostnameByAnyCached(entityId)
      return (
        !!hostname &&
        ((!!hostname.publicly_introduced_at && !hostname.is_blocked) ||
          currentUserCanFilterHostnameModeration(currentUser))
      )
    }
    case 'community':
      try {
        await loadCommunityForViewerOrApplicant(currentUser, entityId)
        return true
      } catch (err) {
        if (typeof err === 'object' && err !== null && 'status' in err && err.status === 404) {
          return false
        }
        throw err
      }
    case 'card':
    case 'discussion':
    case 'image':
    case 'referral_program':
    case 'remote_actor':
    case 'review':
    case 'rewards_program':
    case 'rewards_program_status':
    case 'topic_alias':
      break
  }
  return false
}
