import createHttpError from 'http-errors'
import type { Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { isUUID } from '@modules/utils'
import {
  getElectionVoteChoiceScore,
  chargeElectionVoteRateLimit,
  isElectionVoteChoice,
  withElectionVoteRequestLock,
  type ElectionVoteScore,
  type ElectionVoteMutationResult,
} from './shared/index.mts'
import { enqueueVoteIntegrityCheck } from '@queues/vote-aggregation/enqueues/vote-integrity'
import type { VoteEventContext } from '@voucha/types/entities/election'
import { getContributionStatus } from '@services/contribution-gating/assert'
import { assertWithinContributionQuota } from '@services/contribution-gating/quota'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { EMAIL_VERIFICATION_REQUIRED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'
import type { CreateVoteHandlerOptions } from './vote-handler-options.mts'
import {
  assertNeutralRequiresExistingBallot,
  assertOfficialVoteMutationAccess,
} from './vote-handler-guards.mts'

export type VoteMutationRequest<AccessContext extends Pick<Context, 'assert'>> = {
  currentUser: PrivateUser
  entityId: string
  isClear: boolean
  accessContext: AccessContext
  applyRouteRateLimit: () => Promise<void>
  readBody: () => Promise<unknown>
  validateRequest: (body?: unknown) => void
  getSessionData: () => Promise<{ did: string; sid: string } | null>
  ip: string | undefined
  userAgent: string | null
  /** REST sets `Retry-After` before the 429 throw. MCP reads the error property instead. */
  setRetryAfter?: (seconds: number) => void
}

/** The common REST/MCP admission, ballot and post-commit sequence. */
export async function applyVoteMutation<
  VoteResult extends ElectionVoteMutationResult,
  AccessContext extends Pick<Context, 'assert'>,
>(
  options: CreateVoteHandlerOptions<VoteResult, AccessContext>,
  request: VoteMutationRequest<AccessContext>,
): Promise<void> {
  const { currentUser, isClear, ip } = request

  const ctx: AccessContext = request.accessContext

  await request.applyRouteRateLimit()
  assertNotSuspended(currentUser)
  if (options.preAssertAccess) await options.preAssertAccess(ctx, currentUser)

  // Validate after authorization so denied callers cannot probe malformed IDs.
  ctx.assert(isUUID(request.entityId), 422, 'Invalid ID')
  const entityId = request.entityId.toLowerCase()

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
  if (assertAccess) await assertAccess(ctx, currentUser, resolvedEntity)

  const policy =
    typeof options.votePolicy === 'function'
      ? options.votePolicy(resolvedEntity)
      : (options.votePolicy ?? 'sentiment')
  let score: ElectionVoteScore = null
  let choice: string | null = null
  if (!isClear) {
    const body = await request.readBody()
    request.validateRequest(body)
    ctx.assert(
      body !== null && typeof body === 'object' && !Array.isArray(body),
      422,
      'Invalid request body',
    )
    choice = (body as Record<string, unknown>).choice as string
    ctx.assert(isElectionVoteChoice(policy, choice), 422, 'Invalid vote choice')
    score = getElectionVoteChoiceScore(policy, choice)
  } else {
    request.validateRequest()
  }

  const sessionData = await request.getSessionData()
  const { limited, retryAfterSeconds } = await chargeElectionVoteRateLimit(
    options.rateLimitPrefix,
    currentUser.id,
    ip,
    sessionData,
  )
  if (limited) {
    request.setRetryAfter?.(retryAfterSeconds)
    throw createHttpError(429, 'Too many requests. Please try again later.', {
      retryAfterSeconds,
    })
  }

  const context: VoteEventContext = {
    ipAddress: ip ?? null,
    deviceId: sessionData?.did ?? null,
    sessionId: sessionData?.sid ?? null,
    userAgent: request.userAgent,
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
          if (options.onNoop) await options.onNoop(currentUser, entityId, resolvedEntity)
          return null
        }
      } else {
        assertNeutralRequiresExistingBallot(choice, null)
      }

      if (!isClear) {
        const membershipPlan = currentUser.membership_plan ?? null
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

  const upsertedVote = upsertedVotes?.[0]
  if (!upsertedVote) return

  if (options.onVote) {
    const previousScore = upsertedVote.previous_score ?? null
    await options.onVote(currentUser, entityId, score, resolvedEntity, previousScore, upsertedVote)
  }

  if (!isClear && score !== null && options.enqueueIntegrityCheck !== false) {
    void enqueueVoteIntegrityCheck(options.entityType, entityId, currentUser.id, ip ?? null, score)
  }
}
