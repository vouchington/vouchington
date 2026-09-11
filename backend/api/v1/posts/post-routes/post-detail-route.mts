import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { maybeSanitizeElection } from '@services/elections-votes/shared/sanitize-election'
import {
  getPostByAnyCached,
  getPostElectionByIdCachedBatch,
  getPostMetricsByAnyCached,
} from '@services/entity-fetch'
import renderMarkdown from '@services/markdown'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { listProfileLinks } from '@services/my'
import { getCommunityMember } from '@services/communities/members/get'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import { getCommunityPostReview } from '@services/communities/publications/get'
import type { CommunityMemberRole } from '@services/communities/types'
import {
  canViewPost,
  currentUserCanDeletePost,
  currentUserCanLockPost,
  currentUserCanUnpublishFromCommunity,
  currentUserCanUpdatePost,
  isPostContentEditable,
  maskAnonymousPost,
} from '@services/posts'
import { getUrlEmbedByUrlId } from '@services/rss-feed-items'
import { DELETED_USER_ID, getUserMarkdown, isAdminUser, isFollowingUser } from '@services/users'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import app from '../../../app.mts'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
} from '../../../response-helpers.mts'
import { getRouteAccessPost } from '../get-route-access-post.mts'

app.route('/api/v1/posts/:idOrSlug').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts/:idOrSlug')
  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

  const adminIds = await getAdminUserIdsFromPosts([post])
  const isAdmin = post.created_by_id ? adminIds.has(post.created_by_id) : false
  const authorId =
    !post.is_anonymous && post.created_by_id && post.created_by_id !== DELETED_USER_ID
      ? post.created_by_id
      : null
  const isAuthorAdmin = authorId ? adminIds.has(authorId) : false

  const authorMarkdownPromise = authorId ? getUserMarkdown(authorId) : Promise.resolve(null)
  const profileLinksPromise = authorId ? listProfileLinks(authorId) : Promise.resolve([])
  const isFollowingPromise =
    currentUser && authorId && currentUser.id !== authorId
      ? isFollowingUser(currentUser.id, authorId)
      : Promise.resolve(false)

  const bioHtmlPromise = authorMarkdownPromise.then(markdown =>
    markdown
      ? renderMarkdown(markdown, {
          allowHtml: isAuthorAdmin,
          nofollowLinks: !isAuthorAdmin,
          proxyImages: true,
        })
      : '',
  )

  const communityMemberPromise =
    currentUser && post.community_id
      ? getCommunityMember(post.community_id, currentUser.id)
      : Promise.resolve(null)

  const [html, authorAboutHtml, profileLinks, isFollowing, communityMembership] = await Promise.all(
    [
      post.markdown
        ? renderMarkdown(post.markdown, {
            allowHtml: isAdmin,
            nofollowLinks: !isAdmin,
            proxyImages: true,
          })
        : '',
      bioHtmlPromise,
      profileLinksPromise,
      isFollowingPromise,
      communityMemberPromise,
    ],
  )

  const communityMemberRole: CommunityMemberRole | null = communityMembership?.role ?? null

  const maskedPost = maskAnonymousPost(post!, currentUser)!
  const canUpdatePost = currentUserCanUpdatePost(currentUser, post)
  const canDelete = currentUserCanDeletePost(currentUser, post, { communityMemberRole })
  const canUnpublishFromCommunity = currentUserCanUnpublishFromCommunity(currentUser, post, {
    communityMemberRole,
  })
  const canLock = currentUserCanLockPost(currentUser, post, { communityMemberRole })

  const postResponse: Record<string, unknown> = { ...maskedPost }
  if (canUpdatePost) postResponse.can_edit_content = isPostContentEditable(currentUser!, post)
  if (canDelete) postResponse.can_delete = true
  if (canUnpublishFromCommunity) {
    const review = await getCommunityPostReview(post.community_id!, post.id)
    if (review?.approved_at && !review.rejected_at && !review.unpublished_at) {
      postResponse.can_unpublish_from_community = true
    }
  }
  if (canLock) postResponse.can_lock = true

  const output: Record<string, unknown> = {
    post: postResponse,
    html,
    author_aside: authorId
      ? { about_html: authorAboutHtml, profile_links: profileLinks, is_following: isFollowing }
      : null,
    post_metrics: getPostMetricsByAnyCached(ctx.params.idOrSlug!),
    post_election: getPostElectionByIdCachedBatch([post.id])
      .then(elections => elections[0] ?? null)
      .then(election => maybeSanitizeElection(currentUser, election)),
    communities: getPostCommunitiesRecord([post]),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'post', [post.id]).then(b =>
      Object.keys(b).length > 0 ? b : undefined,
    )
    output.election_vote = getPostElectionVotesByUser(currentUser.id, [post.id]).then(
      votes => votes[0] ?? null,
    )
  }

  // Link posts carry a URL embed sidecar with display metadata; raw crawl fields are administrator-only.
  if (post.post_type === 'link' && post.url_id) {
    output.link_embed = getUrlEmbedByUrlId(
      post.url_id,
      {},
      isAdminUser(currentUser) ? 'administrator' : 'public',
    )
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
