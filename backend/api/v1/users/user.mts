import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanAccessUser,
  getPublicUserByAny,
  getPublicUserByIdOrSlug,
  getPrivateUserByAny,
  getPrivateUserByIdOrSlug,
  isAdminUser,
  isOfficialAccount,
  updateUser,
  deleteUser,
  assertNotSuspended,
  type UpdateUserOptions,
} from '@services/users'
import { getUserMetricsByAnyCached, getUserProfileMetricsByAny } from '@services/entity-fetch'
import { getFollowedUsersByElectionVote } from '@services/users/follow-context'
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
import {
  apiNoRequestBody,
  apiOpenApiNoContent,
  apiRequestContract,
  apiResponse,
} from '../../response-contract.mts'
import type { ElectionVoteRequest } from '@voucha/types/entities/election'
import type { PrivateUser } from '@services/users/types'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  setAnonymousPublicCacheHeaders,
} from '../../response-helpers.mts'

app
  .route('/api/v1/users/:idOrSlug')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users/:idOrSlug')
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

    const includeBio = ctx.query.include_bio === '1'
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
    const updated = await updateUser(currentUser, ctx.params.idOrSlug!, body)
    ctx.json({ user: { ...updated, is_official_account: isOfficialAccount(updated) } })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/users/:idOrSlug')
    const user = await getPrivateUserByIdOrSlug(ctx.params.idOrSlug!)
    ctx.assert(user, 404, 'User not found')
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
})

const clearUserVouchVoteHandler = createVoteClearHandler({
  ...userVouchBaseOptions,
  routeKey: 'DELETE:/api/v1/users/:id/vouch-vote',
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

async function getUserVouchContextResponse(currentUser: PrivateUser, targetId: string) {
  const [positive_by_following, negative_by_following, election_vote] = await Promise.all([
    getFollowedUsersByElectionVote(currentUser, targetId, 'user_vouch_votes', 1),
    getFollowedUsersByElectionVote(currentUser, targetId, 'user_vouch_votes', -1),
    getUserVouchElectionVote(currentUser.id, targetId),
  ])
  return { positive_by_following, negative_by_following, election_vote }
}
