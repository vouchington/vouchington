/** Internal persistence value. `null` is an append-only Clear event. */
export type ElectionVoteScore = -2 | -1 | 0 | 1 | 2 | null

export type ElectionVotePolicy = 'sentiment' | 'recommendation' | 'relation' | 'moderation'

export type ElectionVoteChoice =
  | 'vouch'
  | 'like'
  | 'neutral'
  | 'dislike'
  | 'disavow'
  | 'support'
  | 'oppose'
  | 'confirm'
  | 'dispute'
  | 'accurate'
  | 'inaccurate'

export type ElectionVoteChoiceForPolicy<TPolicy extends ElectionVotePolicy> = Extract<
  ElectionVoteChoice,
  TPolicy extends 'sentiment'
    ? 'vouch' | 'like' | 'neutral' | 'dislike' | 'disavow'
    : TPolicy extends 'recommendation'
      ? 'support' | 'oppose'
      : TPolicy extends 'relation'
        ? 'confirm' | 'dispute'
        : 'accurate' | 'inaccurate'
>

/** Canonical semantic ballot scores shared by request validation and generated DB schema tests. */
export const ELECTION_VOTE_POLICY_SCORES = {
  sentiment: { vouch: 2, like: 1, neutral: 0, dislike: -1, disavow: -2 },
  recommendation: { support: 1, oppose: -1 },
  relation: { confirm: 1, dispute: -1 },
  moderation: { accurate: 1, inaccurate: -1 },
} as const satisfies Record<ElectionVotePolicy, Record<string, ElectionVoteScore>>

/** Public request body for a ballot constrained to the target election's policy. */
export type ElectionVoteRequest<TPolicy extends ElectionVotePolicy> = {
  choice: ElectionVoteChoiceForPolicy<TPolicy>
}

export type ViewElection = { id: string }

export type ViewBaseElection = {
  __entity_type: string
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export type ElectionVote<TPolicy extends ElectionVotePolicy = ElectionVotePolicy> = {
  __entity_type: 'election_vote'
  user_id: string
  entity_id: string
  /** Semantic ballot exposed to API callers. Clear rows are excluded from current reads. */
  choice: ElectionVoteChoiceForPolicy<TPolicy>
  created_at: Date
}

/** Internal persistence event; never expose raw numeric ballots in API responses. */
export type ElectionVoteEvent = {
  user_id: string
  entity_id: string
  score: ElectionVoteScore
  created_at: Date
  // The same user's latest score for this entity before this vote row was inserted (append-only
  // vote tables never update in place — see upsertElectionVotesShared). `null` covers both "never
  // voted before" and upsert implementations that don't populate this field.
  previous_score?: ElectionVoteScore
}

export type VoteStatsSnapshot = {
  /** Epoch-aware upper transaction-ID boundary from `pg_current_snapshot()`. */
  xmax: string
  /** In-progress transaction count; lower is newer when `xmax` is equal. */
  xipCount: number
}

export type AggregatedElectionStats = {
  votes_score_up: number
  votes_score_none: number
  votes_score_down: number
  votes_count_up: number
  votes_count_none: number
  votes_count_down: number
  snapshot: VoteStatsSnapshot
}

export type EntityElectionConfig = {
  entityTable: string | null
  voteTable: string
  entityIdColumn: string
  entityType: string
  deletedAtFilter: boolean
  tracksOutboundActivityPubLike?: boolean
  tracksNeutralScore?: boolean
  tracksSemanticScore?: boolean
  legacySentimentEntityFilter?: { field: string; excludedValues: string[] }
  votePolicy?: ElectionVotePolicy
  /**
   * Entity field values that override `votePolicy` for current-vote projections. This supports
   * one vote table serving entity subtypes with distinct semantic ballots.
   */
  votePolicyByEntityField?: {
    field: string
    policies: Record<string, ElectionVotePolicy>
  }
}

export type VoteEventContext = {
  ipAddress: string | null
  deviceId: string | null
  sessionId: string | null
  userAgent: string | null
}
