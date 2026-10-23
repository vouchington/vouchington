import type { Context } from '@jongleberry/api-server'
import type { ElectionVoteMutationResult } from '@services/elections-votes/shared'
import { applyVoteMutation } from '@services/elections-votes/vote-handler'
import type { CreateVoteHandlerOptions } from '@services/elections-votes/vote-handler-options'
import { parseJsonBody, validateRequestContract } from './response-helpers.mts'
import { enforceLowScoreBotChallenge } from './bot-challenge.mts'

export type { CreateVoteHandlerOptions } from '@services/elections-votes/vote-handler-options'

export function createVoteHandler<VoteResult extends ElectionVoteMutationResult>(
  options: CreateVoteHandlerOptions<VoteResult>,
): (ctx: Context) => Promise<void> {
  return createVoteMutationHandler(options, false)
}

export function createVoteClearHandler<VoteResult extends ElectionVoteMutationResult>(
  options: CreateVoteHandlerOptions<VoteResult>,
): (ctx: Context) => Promise<void> {
  return createVoteMutationHandler(options, true)
}

function createVoteMutationHandler<VoteResult extends ElectionVoteMutationResult>(
  options: CreateVoteHandlerOptions<VoteResult>,
  isClear: boolean,
): (ctx: Context) => Promise<void> {
  return async function handleVote(ctx: Context): Promise<void> {
    const currentUser = await ctx.getCurrentUser()
    ctx.assert(currentUser, 401, 'Unauthorized')
    await ctx.applyRouteRateLimit(options.routeKey)
    await enforceLowScoreBotChallenge(ctx)
    await applyVoteMutation(options, {
      currentUser,
      entityId: ctx.params.id!,
      isClear,
      accessContext: ctx,
      applyRouteRateLimit: () => Promise.resolve(),
      readBody: () => parseJsonBody(ctx, '10kb'),
      validateRequest: body => {
        if (!options.requestContractOperation) return
        validateRequestContract(ctx, options.requestContractOperation, {
          ...(isClear ? {} : { body }),
          path: ctx.params,
        })
      },
      getSessionData: () => ctx.getSessionTokenData(),
      ip: ctx.ip,
      setRetryAfter: seconds => {
        ctx.set('Retry-After', String(seconds))
      },
      get userAgent() {
        return (ctx.req.headers['user-agent'] as string | undefined) ?? null
      },
    })
    ctx.setStatus(204)
  }
}
