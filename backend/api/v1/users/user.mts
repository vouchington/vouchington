import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessUser,
  getPublicUserByAny,
  getPublicUserByIdOrSlug,
  getPrivateUserByAny,
  getPrivateUserByIdOrSlug,
  isAdminUser,
  updateUser,
  deleteUser,
  assertNotSuspended,
  type UpdateUserOptions,
} from '@services/users'
import { getUserMetricsByAnyCached, getUserProfileMetricsByAny } from '@services/entity-fetch'
import { listProfileLinks } from '@services/my/profile-links'
import {
  createVoteClearHandler,
  createVoteHandler,
  type CreateVoteHandlerOptions,
} from '../../election-vote-handler.mts'
import {
  getUserVouchElectionById,
  getUserVouchElectionVote,
  upsertUserVouchElectionVotes,
} from '@services/elections-votes/user-vouch'
import { createVoteStatsNoopReconciler } from '@services/elections-votes/shared'
import { enqueueBulkUpdateUserVouchElectionVoteStats } from '@queues/elections/enqueues'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import renderMarkdown from '@services/markdown'
import { defineQueryContract, queryEnum } from '@modules/pagination'
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiQuery,
  apiRequestContract,
  apiResponse,
} from '../../response-contract.mts'

const userProfileQueryContract = defineQueryContract({
  include_bio: queryEnum(['0', '1'] as const),
})
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import { getUserVouchContextResponse } from './user-vouch-context.mts'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  requireAuthForSuspendedException,
  setAnonymousPublicCacheHeaders,
  validateRequestContract,
} from '../../response-helpers.mts'

app
  .route('/api/v1/users/:idOrSlug')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug')
    const includeBio = ctx.query.include_bio === '1'
    const recognizedIncludeBio = ctx.query.include_bio === '1' || ctx.query.include_bio === '0'
    apiQuery('GET:/api/v1/users/:idOrSlug', userProfileQueryContract)
    validateRequestContract(ctx, 'GET:/api/v1/users/:idOrSlug', {
      path: ctx.params,
      query: recognizedIncludeBio ? { include_bio: ctx.query.include_bio } : {},
    })
    const idOrSlug = ctx.params.idOrSlug!

    // Check if user is requesting their own profile (by ID or username)
    const isSelf =
      currentUser?.id === idOrSlug ||
      (currentUser?.username && idOrSlug.toLowerCase() === currentUser.username.toLowerCase())

    const selfUser = isSelf ? await getPrivateUserByIdOrSlug(idOrSlug) : null
    let resolvedUser
    if (isSelf) {
      ctx.assert(selfUser, 404, 'User not found')
      resolvedUser = selfUser
    } else {
      const publicUser = await getPublicUserByIdOrSlug(idOrSlug)
      ctx.assert(publicUser, 404, 'User not found')
      resolvedUser = currentUserCanAccessUser(currentUser ?? null, publicUser.id)
        ? await getPrivateUserByAny(publicUser.id)
        : publicUser
      ctx.assert(resolvedUser, 404, 'User not found')
    }

    const isAdminViewer = isAdminUser(currentUser ?? null)
    const [user_metrics, profile_links, user_bio_html, user_vouch_election] = await Promise.all([
      currentUser
        ? getUserProfileMetricsByAny(resolvedUser.id, {
            currentUser: currentUser ?? undefined,
          })
        : getUserMetricsByAnyCached(resolvedUser.id),
      listProfileLinks(resolvedUser.id),
      includeBio && resolvedUser.markdown ? renderMarkdown(resolvedUser.markdown) : null,
      isAdminViewer ? getUserVouchElectionById(resolvedUser.id) : Promise.resolve(null),
    ])

    setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_LONG_MAX_AGE_SECONDS)

    const response = {
      user: resolvedUser,
      user_metrics,
      profile_links,
      user_bio_html,
      ...(isAdminViewer ? { user_vouch_election } : {}),
    }
    if (selfUser) {
      ctx.json(
        apiResponse('GET:/api/v1/users/:idOrSlug#self', {
          ...response,
          user: selfUser,
        }),
      )
      return
    }
    ctx.json(response)
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/users/:idOrSlug')
    assertNotSuspended(currentUser)
    const body = (await ctx.request.json('1mb')) as UpdateUserOptions
    validateRequestContract(ctx, 'PATCH:/api/v1/users/:idOrSlug', { body })
    const updated = await updateUser(currentUser, ctx.params.idOrSlug!, body)
    ctx.json({ user: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthForSuspendedException(
      ctx,
      'DELETE:/api/v1/users/:idOrSlug',
    )
    validateRequestContract(ctx, 'DELETE:/api/v1/users/:idOrSlug', { path: ctx.params })
    const user = await getPrivateUserByIdOrSlug(ctx.params.idOrSlug!)
    ctx.assert(user, 404, 'User not found')
    if (currentUser.id !== user.id) assertNotSuspended(currentUser)
    await deleteUser(currentUser, user)
    ctx.setStatus(202)
    ctx.json(apiResponse('DELETE:/api/v1/users/:idOrSlug', { logout: currentUser.id === user.id }))
  })

const userVouchBaseOptions: Omit<CreateVoteHandlerOptions, 'routeKey'> = {
  rateLimitPrefix: 'user-vouch-election-vote',
  entityType: 'user_vouch' as const,
  getEntity: getPublicUserByAny,
  entityNotFoundMessage: 'User not found',
  votePolicy: 'sentiment' as const,
  upsertVotes: upsertUserVouchElectionVotes,
  getCurrentVote: getUserVouchElectionVote,
  onNoop: createVoteStatsNoopReconciler(enqueueBulkUpdateUserVouchElectionVoteStats),
  assertAccess: (ctx: Context, currentUser, entity) => {
    ctx.assert((entity as { id: string }).id !== currentUser.id, 403, 'Cannot vote on yourself')
  },
  enqueueIntegrityCheck: false,
}

const userVouchVoteHandler = createVoteHandler({
  ...userVouchBaseOptions,
  routeKey: 'PUT:/api/v1/users/:id/vouch-vote',
  requestContractOperation: 'PUT:/api/v1/users/:id/vouch-vote',
})

const clearUserVouchVoteHandler = createVoteClearHandler({
  ...userVouchBaseOptions,
  routeKey: 'DELETE:/api/v1/users/:id/vouch-vote',
  requestContractOperation: 'DELETE:/api/v1/users/:id/vouch-vote',
})

app.route('/api/v1/users/:id/vouch-vote').put(async ctx => {
  apiRequestContract<'PUT:/api/v1/users/:id/vouch-vote', ElectionVoteRequest<'sentiment'>>(
    'PUT:/api/v1/users/:id/vouch-vote',
  )
  apiOpenApiNoContent('PUT:/api/v1/users/:id/vouch-vote', 204)
  await userVouchVoteHandler(ctx)
})

app.route('/api/v1/users/:id/vouch-vote').delete(async ctx => {
  apiNoRequestBody('DELETE:/api/v1/users/:id/vouch-vote')
  apiOpenApiNoContent('DELETE:/api/v1/users/:id/vouch-vote', 204)
  await clearUserVouchVoteHandler(ctx)
})

app.route('/api/v1/users/:id/vouch-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/users/:id/vouch-context')
  validateRequestContract(ctx, 'GET:/api/v1/users/:id/vouch-context', { path: ctx.params })
  const target = await getPublicUserByAny(ctx.params.id!)
  ctx.assert(target, 404, 'User not found')

  const response: Awaited<ReturnType<typeof getUserVouchContextResponse>> =
    target.id === currentUser.id
      ? {
          positive_by_following: { total: 0, users: [] },
          negative_by_following: { total: 0, users: [] },
          election_vote: null,
        }
      : await getUserVouchContextResponse(currentUser, target.id)

  ctx.json(apiResponse('GET:/api/v1/users/:id/vouch-context', response))
})
