import type { Context } from '@jongleberry/api-server'
import type {
  ElectionVote,
  ElectionVotePolicy,
  VoteEventContext,
} from '@voucha/types/entities/election'
import type {
  ElectionVoteMutationResult,
  ElectionVoteScore,
} from '@services/elections-votes/shared'
import type { PrivateUser } from '@services/users/types'

export type CreateVoteHandlerOptions<
  VoteResult extends ElectionVoteMutationResult = ElectionVoteMutationResult,
> = {
  rateLimitPrefix: string
  entityType: string
  /** Route key for `ctx.applyRouteRateLimit()`; every vote endpoint participates in it. */
  routeKey: string
  /** Optional generated contract key for this route's path and vote body. */
  requestContractOperation?: string
  upsertVotes: (
    userId: string,
    votes: Array<{ entityId: string; score: ElectionVoteScore }>,
    context: VoteEventContext,
  ) => Promise<VoteResult[]>
  getEntity: (id: string) => Promise<unknown>
  entityNotFoundMessage: string
  votePolicy?: ElectionVotePolicy | ((entity: unknown) => ElectionVotePolicy)
  /** Current ballot used to suppress same-choice and official Clear no-ops before quota. */
  getCurrentVote?: (userId: string, entityId: string) => Promise<ElectionVote | null>
  /** Runs before entity lookup, for checks that must not disclose entity existence. */
  preAssertAccess?: (ctx: Context, currentUser: PrivateUser) => Promise<void> | void
  /** Runs after entity lookup, when the access decision needs the entity. */
  assertAccess?: (ctx: Context, currentUser: PrivateUser, entity: unknown) => Promise<void> | void
  /** Runs after entity lookup when clearing a prior ballot has narrower access requirements. */
  assertClearAccess?: (
    ctx: Context,
    currentUser: PrivateUser,
    entity: unknown,
  ) => Promise<void> | void
  onVote?: (
    currentUser: PrivateUser,
    entityId: string,
    score: ElectionVoteScore,
    entity: unknown,
    previousScore: ElectionVoteScore | null,
    vote: VoteResult,
  ) => Promise<void> | void
  /** Idempotent repair hook for same-choice/Clear retries whose post-commit work failed. */
  onNoop?: (currentUser: PrivateUser, entityId: string, entity: unknown) => Promise<void> | void
  enqueueIntegrityCheck?: boolean
  allowOfficialAccounts?: boolean
  shouldAllowOfficialAccount?: (
    currentUser: PrivateUser,
    entity: unknown,
  ) => Promise<boolean> | boolean
  shouldBypassContributionGating?: (
    currentUser: PrivateUser,
    entity: unknown,
  ) => Promise<boolean> | boolean
}
