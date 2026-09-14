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
import { assertNotSuspended, isAdminUser, isModerationStaff } from '@services/users'
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
    isModerationStaff,
    'POST:/api/v1/posts/:idOrSlug/clearances',
  )

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const body = (await ctx.request.json('8kb')) as {
    status?: unknown
    reason_code?: unknown
    private_note?: unknown
  }
  const validStatuses: ClearanceStatus[] = ['approved', 'rejected', 'in_review', 'pending']
  ctx.assert(
    typeof body.status === 'string' && validStatuses.includes(body.status as ClearanceStatus),
    422,
    'Invalid status',
  )
  ctx.assert(
    typeof body.reason_code === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(body.reason_code),
    422,
    'reason_code must be a stable identifier',
  )
  ctx.assert(
    body.private_note === undefined ||
      (typeof body.private_note === 'string' &&
        body.private_note.trim() === body.private_note &&
        body.private_note.length <= 4000),
    422,
    'private_note must be trimmed and at most 4000 characters',
  )

  await updateClearanceStatus(post.id, body.status as ClearanceStatus, currentUser.id, {
    reasonCode: body.reason_code,
    privateNote: body.private_note,
    platformOverride: true,
  })

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
