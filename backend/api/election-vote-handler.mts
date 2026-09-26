import type { Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { isUUID } from '@modules/utils'
import { validateRequestContract } from './response-helpers.mts'
import {
  getElectionVoteChoiceScore,
  getElectionVoteRateLimitKeys,
  isElectionVoteChoice,
  withElectionVoteRequestLock,
  type ElectionVoteScore,
  type ElectionVoteMutationResult,
} from '@services/elections-votes/shared'
import { enqueueVoteIntegrityCheck } from '@queues/vote-integrity/enqueues'
import type { VoteEventContext } from '@voucha/types/entities/election'
import { getUserActivePlan } from '@services/memberships'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { assertWithinContributionQuota } from '@services/contribution-gating/quota'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'
import type { CreateVoteHandlerOptions } from './election-vote-handler-options.mts'
import {
  assertNeutralRequiresExistingBallot,
  assertOfficialVoteMutationAccess,
} from './election-vote-handler-guards.mts'

export type { CreateVoteHandlerOptions } from './election-vote-handler-options.mts'

const VOTE_REQUESTS_PER_MINUTE = 30

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
  const rateLimiter = new RateLimiter({ prefix: options.rateLimitPrefix, ttlSeconds: 60 })

  return async function handleVote(ctx: Context): Promise<void> {
    ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')

    const currentUser = await ctx.getCurrentUser()
    ctx.assert(currentUser, 401, 'Unauthorized')

    await ctx.applyRouteRateLimit(options.routeKey)

    if (options.preAssertAccess) {
      await options.preAssertAccess(ctx, currentUser)
    }

    const isAdmin = isAdminUser(currentUser)
    const entity =
      options.shouldBypassContributionGating || options.shouldAllowOfficialAccount
        ? await options.getEntity(ctx.params.id!)
        : undefined
    if (options.shouldBypassContributionGating || options.shouldAllowOfficialAccount) {
      ctx.assert(entity, 404, options.entityNotFoundMessage)
    }
    const officialAccountAllowed =
      options.allowOfficialAccounts ||
      (entity && options.shouldAllowOfficialAccount
        ? await options.shouldAllowOfficialAccount(currentUser, entity)
        : false)
    assertOfficialVoteMutationAccess(currentUser, isClear, officialAccountAllowed)
    const bypassContributionGating =
      entity && options.shouldBypassContributionGating
        ? await options.shouldBypassContributionGating(currentUser, entity)
        : false
    const resolvedEntity = entity ?? (await options.getEntity(ctx.params.id!))
    ctx.assert(resolvedEntity, 404, options.entityNotFoundMessage)
    const assertAccess =
      options[isClear ? 'assertClearAccess' : 'assertAccess'] ?? options.assertAccess
    if (assertAccess) {
      await assertAccess(ctx, currentUser, resolvedEntity)
    }

    const policy =
      typeof options.votePolicy === 'function'
        ? options.votePolicy(resolvedEntity)
        : (options.votePolicy ?? 'sentiment')
    let score: ElectionVoteScore = null
    let choice: string | null = null
    if (!isClear) {
      const body = await ctx.request.json('10kb')
      if (options.requestContractOperation) {
        validateRequestContract(ctx, options.requestContractOperation, { body, path: ctx.params })
      }
      ctx.assert(
        body !== null && typeof body === 'object' && !Array.isArray(body),
        422,
        'Invalid request body',
      )
      choice = (body as Record<string, unknown>).choice as string
      ctx.assert(isElectionVoteChoice(policy, choice), 422, 'Invalid vote choice')
      score = getElectionVoteChoiceScore(policy, choice)
    } else if (options.requestContractOperation) {
      validateRequestContract(ctx, options.requestContractOperation, { path: ctx.params })
    }

    const sessionData = await ctx.getSessionTokenData()
    const rateLimitKeys = getElectionVoteRateLimitKeys(currentUser.id, ctx.ip, sessionData)
    const { limited } = await rateLimiter.addAndCheck(rateLimitKeys, VOTE_REQUESTS_PER_MINUTE + 1)
    ctx.assert(!limited, 429, 'Too many requests. Please try again later.')

    const context: VoteEventContext = {
      ipAddress: ctx.ip ?? null,
      deviceId: sessionData.did ?? null,
      sessionId: sessionData.sid ?? null,
      userAgent: (ctx.req.headers['user-agent'] as string | undefined) ?? null,
    }
    // Serialize the read/quota-reservation/append decision across application instances. The
    // persistence layer has its own differently-namespaced lock, so the nested vote transaction
    // cannot deadlock this request-level idempotency boundary.
    const upsertedVotes = await withElectionVoteRequestLock(
      options.entityType,
      currentUser.id,
      ctx.params.id!,
      async () => {
        if (options.getCurrentVote) {
          const currentVote = await options.getCurrentVote(currentUser.id, ctx.params.id!)
          assertNeutralRequiresExistingBallot(choice, currentVote)
          if ((isClear && currentVote === null) || (!isClear && currentVote?.choice === choice)) {
            if (options.onNoop) {
              await options.onNoop(currentUser, ctx.params.id!, resolvedEntity)
            }
            return null
          }
        } else {
          assertNeutralRequiresExistingBallot(choice, null)
        }

        if (!isClear) {
          const membershipPlan = await getUserActivePlan(currentUser.id)
          if (!bypassContributionGating) {
            const contributionStatus = await getContributionStatus(currentUser, {
              membershipPlan,
              skipAccountAgeGate: true,
            })
            if (!contributionStatus.allowed) {
              throw createCodedError(
                403,
                'A verified non-disposable email address is required to vote.',
                EMAIL_VERIFICATION_REQUIRED,
              )
            }
          }
          await assertWithinContributionQuota(currentUser.id, isAdmin, membershipPlan)
        }

        return options.upsertVotes(currentUser.id, [{ entityId: ctx.params.id!, score }], context)
      },
    )

    if (upsertedVotes === null) {
      ctx.setStatus(204)
      return
    }

    const upsertedVote = upsertedVotes[0]
    if (!upsertedVote) {
      ctx.setStatus(204)
      return
    }

    if (options.onVote) {
      const previousScore = upsertedVotes[0]?.previous_score ?? null
      await options.onVote(
        currentUser,
        ctx.params.id!,
        score,
        resolvedEntity,
        previousScore,
        upsertedVote,
      )
    }

    if (!isClear && score !== null && options.enqueueIntegrityCheck !== false) {
      enqueueVoteIntegrityCheck(
        options.entityType,
        ctx.params.id!,
        currentUser.id,
        ctx.ip ?? null,
        score,
      )
    }

    ctx.setStatus(204)
  }
}
