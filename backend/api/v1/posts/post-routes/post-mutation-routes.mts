import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities/members/get'
import type { CommunityMemberRole } from '@services/communities/types'
import { getPostByAnyCached } from '@services/entity-fetch'
import { invalidate } from '@services/entity-cache/invalidate'
import { updateClearanceStatus, type ClearanceStatus } from '@services/post-clearance'
import {
  canViewPost,
  currentUserCanLockPost,
  deletePost,
  lockPost,
  unlockPost,
  updatePost,
  type CreatePostUpdates,
} from '@services/posts'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { getUserActivePlan } from '@services/memberships'
import app from '../../../app.mts'
import { requireAuth, requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { getRouteAccessPost, getRouteRootAccessPost } from '../get-route-access-post.mts'

app.route('/api/v1/posts/:idOrSlug').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/posts/:idOrSlug')
  assertNotSuspended(currentUser)

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  const changes = (await ctx.request.json('1mb')) as CreatePostUpdates
  ctx.assert(
    changes.slug === undefined || isAdminUser(currentUser),
    403,
    'Only admins can set a post slug',
  )
  const membershipPlan =
    changes.structured_data !== undefined ||
    changes.categories !== undefined ||
    changes.title !== undefined ||
    changes.markdown !== undefined
      ? await getUserActivePlan(currentUser.id)
      : null
  const updated = await updatePost(currentUser, post, changes, membershipPlan)

  ctx.json({ post: updated })
})

app.route('/api/v1/posts/:idOrSlug').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:idOrSlug')
  assertNotSuspended(currentUser)

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  // For community-scoped comments, fetch membership to check moderation rights
  let communityMemberRole: CommunityMemberRole | null = null
  if (post.community_id && post.post_type === 'comment') {
    const membership = await getCommunityMember(post.community_id, currentUser.id)
    communityMemberRole = membership?.role ?? null
  }

  const canModerateHiddenComment =
    post.post_type === 'comment' &&
    (communityMemberRole === 'owner' || communityMemberRole === 'moderator')
  const privacyPost = canModerateHiddenComment
    ? await getRouteRootAccessPost(post)
    : await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  await deletePost(currentUser, post, { communityMemberRole })
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/clearances').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'POST:/api/v1/posts/:idOrSlug/clearances',
  )

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const body = (await ctx.request.json('1kb')) as { status: ClearanceStatus }
  const validStatuses: ClearanceStatus[] = ['approved', 'rejected', 'in_review', 'pending']
  ctx.assert(validStatuses.includes(body.status), 422, 'Invalid status')

  await updateClearanceStatus(post.id, body.status, currentUser.id)

  ctx.json({ clearance_status: body.status })
})

app.route('/api/v1/posts/:idOrSlug/lock').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts/:idOrSlug/lock')
  assertNotSuspended(currentUser)

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  const communityMemberRole: CommunityMemberRole | null = post.community_id
    ? ((await getCommunityMember(post.community_id, currentUser.id))?.role ?? null)
    : null

  ctx.assert(currentUserCanLockPost(currentUser, post, { communityMemberRole }), 403, 'Forbidden')
  await lockPost(post.id, currentUser.id)
  await invalidate.posts(post.id)
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/lock').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:idOrSlug/lock')
  assertNotSuspended(currentUser)

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  const communityMemberRole: CommunityMemberRole | null = post.community_id
    ? ((await getCommunityMember(post.community_id, currentUser.id))?.role ?? null)
    : null

  ctx.assert(currentUserCanLockPost(currentUser, post, { communityMemberRole }), 403, 'Forbidden')
  await unlockPost(post.id, currentUser.id)
  await invalidate.posts(post.id)
  ctx.setStatus(204)
})
