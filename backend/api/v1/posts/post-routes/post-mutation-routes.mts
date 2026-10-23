import type { Context } from '@jongleberry/api-server'
import { getCommunityMember } from '@services/communities/members/get'
import type { CommunityMemberRole } from '@services/communities/types'
import { attachWrittenPostProvenance } from '@services/content-provenance'
import { setPostLock } from '@services/posts/lock-action'
import {
  canViewPost,
  currentUserCanUpdatePost,
  deletePost,
  updatePost,
  type UpdatePostChanges,
} from '@services/posts'
import { assertNotSuspended, isAdminUser } from '@services/users'
import { assertPostUpdatePreflight } from '@services/posts/update/validation'
import app from '../../../app.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import {
  getRouteAccessPost,
  getRoutePostByAnyCached,
  getRouteRootAccessPost,
} from '@services/posts/route-access'

app.route('/api/v1/posts/:idOrSlug').patch(async (ctx: Context) => {
  apiRequestContract<'PATCH:/api/v1/posts/:idOrSlug', UpdatePostChanges>(
    'PATCH:/api/v1/posts/:idOrSlug',
  )
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/posts/:idOrSlug')
  assertNotSuspended(currentUser)
  const { post, root } = await getRoutePostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')
  const privacyPost = await getRouteAccessPost(post, root)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')
  ctx.assert(currentUserCanUpdatePost(currentUser, post), 403, 'Forbidden')

  const parsedChanges = await parseJsonBody(ctx, '1mb')
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
      ? (currentUser.membership_plan ?? null)
      : null
  const updated = await updatePost(currentUser, post, changes, membershipPlan)

  ctx.json({ post: await attachWrittenPostProvenance(updated, currentUser) })
})

app.route('/api/v1/posts/:idOrSlug').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:idOrSlug')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/posts/:idOrSlug', { path: ctx.params })

  const { post, root } = await getRoutePostByAnyCached(ctx.params.idOrSlug!)
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
    ? await getRouteRootAccessPost(post, root)
    : await getRouteAccessPost(post, root)
  ctx.assert(privacyPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, privacyPost), 404, 'Post not found')

  await deletePost(currentUser, post, { communityMemberRole })
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/lock').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/posts/:idOrSlug/lock')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/lock', { path: ctx.params })

  await setPostLock(currentUser, ctx.params.idOrSlug!, true)
  ctx.setStatus(204)
})

app.route('/api/v1/posts/:idOrSlug/lock').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:idOrSlug/lock')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/posts/:idOrSlug/lock', { path: ctx.params })

  await setPostLock(currentUser, ctx.params.idOrSlug!, false)
  ctx.setStatus(204)
})
