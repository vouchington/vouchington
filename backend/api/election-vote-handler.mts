import type { Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { isUUID } from '@modules/utils'
import { validateRequestContract } from './response-helpers.mts'
import {
  getElectionVoteChoiceScore,
  chargeElectionVoteRateLimit,
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
    assertNotSuspended(currentUser)
    if (options.preAssertAccess) {
      await options.preAssertAccess(ctx, currentUser)
    }

    // Validate after authorization so denied callers cannot probe malformed IDs.
    ctx.assert(isUUID(ctx.params.id!), 422, 'Invalid ID')
    const entityId = ctx.params.id!.toLowerCase()

    const isAdmin = isAdminUser(currentUser)
    const entity =
      options.shouldBypassContributionGating || options.shouldAllowOfficialAccount
        ? await options.getEntity(entityId)
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
    const resolvedEntity = entity ?? (await options.getEntity(entityId))
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
    const { limited } = await chargeElectionVoteRateLimit(
      options.rateLimitPrefix,
      currentUser.id,
      ctx.ip,
      sessionData,
    )
    ctx.assert(!limited, 429, 'Too many requests. Please try again later.')

    const context: VoteEventContext = {
      ipAddress: ctx.ip ?? null,
      deviceId: sessionData.did ?? null,
      sessionId: sessionData.sid ?? null,
      userAgent: (ctx.req.headers['user-agent'] as string | undefined) ?? null,
    }
    // Serialize read/quota/append; persistence uses a separate lock namespace to prevent deadlocks.
    const upsertedVotes = await withElectionVoteRequestLock(
      options.entityType,
      currentUser.id,
      entityId,
      async () => {
        if (options.getCurrentVote) {
          const currentVote = await options.getCurrentVote(currentUser.id, entityId)
          assertNeutralRequiresExistingBallot(choice, currentVote)
          if ((isClear && currentVote === null) || (!isClear && currentVote?.choice === choice)) {
            if (options.onNoop) {
              await options.onNoop(currentUser, entityId, resolvedEntity)
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

        return options.upsertVotes(currentUser.id, [{ entityId, score }], context)
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
        entityId,
        score,
        resolvedEntity,
        previousScore,
        upsertedVote,
      )
    }

    if (!isClear && score !== null && options.enqueueIntegrityCheck !== false) {
      void enqueueVoteIntegrityCheck(
        options.entityType,
        entityId,
        currentUser.id,
        ctx.ip ?? null,
        score,
      )
    }

    ctx.setStatus(204)
  }
}
