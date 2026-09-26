import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities/members/get'
import type { CommunityMemberRole } from '@services/communities/types'
import { getPostByAnyCached } from '@services/entity-fetch'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  canViewPost,
  currentUserCanUpdatePost,
  currentUserCanLockPost,
  deletePost,
  lockPost,
  unlockPost,
  updatePost,
  type UpdatePostChanges,
} from '@services/posts'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { assertPostUpdatePreflight } from '@services/posts/update/validation'
import { getUserActivePlan } from '@services/memberships'
import app from '../../../app.mts'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { apiRequestContract } from '../../../response-contract.mts'
import { getRouteAccessPost, getRouteRootAccessPost } from '../get-route-access-post.mts'

app.route('/api/v1/posts/:idOrSlug').patch(async (ctx: Context) => {
  apiRequestContract<'PATCH:/api/v1/posts/:idOrSlug', UpdatePostChanges>(
    'PATCH:/api/v1/posts/:idOrSlug',
  )
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/posts/:idOrSlug')
  assertNotSuspended(currentUser)
  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  const privacyPost = await getRouteAccessPost(post)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')
  ctx.assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')

  const parsedChanges = await ctx.request.json('1mb')
  ctx.assert(
    parsedChanges !== null && typeof parsedChanges === 'object' && !Array.isArray(parsedChanges),
    422,
    'Invalid request body',
  )
  const changes = parsedChanges as UpdatePostChanges
  ctx.assert(
    changes.slug === undefined || isAdminUser(currentUser),
    403,
    'Only admins can set a post slug',
  )
  assertPostUpdatePreflight(currentUser, post, changes)
  validateRequestContract(ctx, 'PATCH:/api/v1/posts/:idOrSlug', { body: changes, path: ctx.params })
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
  validateRequestContract(ctx, 'DELETE:/api/v1/posts/:idOrSlug', { path: ctx.params })

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

app.route('/api/v1/posts/:idOrSlug/lock').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts/:idOrSlug/lock')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/lock', { path: ctx.params })

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
  validateRequestContract(ctx, 'DELETE:/api/v1/posts/:idOrSlug/lock', { path: ctx.params })

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
