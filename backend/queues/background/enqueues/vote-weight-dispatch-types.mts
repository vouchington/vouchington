/** Exact database timestamp strings preserve microseconds across queue continuations. */
export type VoteWeightDispatchWindow = {
  previousThroughAt: string | null
  windowStart: string | null
  windowEnd: string
}
export type VoteWeightTimestampKeyset = { at: string; id: string }
export type VoteWeightRejectedEvidenceKeyset = VoteWeightTimestampKeyset & {
  /** Resume a single rejected evidence event that fans out to more than one source. */
  afterSourceId?: string
}
export type VoteWeightAgeMilestonesData = {
  /** Operator backfills scan all eligible users; scheduled runs resume the durable cursor. */
  fullReplay?: boolean
  window?: VoteWeightDispatchWindow
  milestoneIndex?: number
  afterId?: string
}
export type VoteWeightMembershipExpirationsData = {
  fullReplay?: boolean
  window?: VoteWeightDispatchWindow
  after?: VoteWeightTimestampKeyset
}
export type VoteWeightFamilySourceChangesData = {
  fullReplay?: boolean
  window?: VoteWeightDispatchWindow
  branches?: Partial<
    Record<
      'updated_at' | 'effective_at' | 'expires_at' | 'rejected_at',
      VoteWeightRejectedEvidenceKeyset | null
    >
  >
}
export type VoteWeightDispatchEvent = { userId: string; jobId: string }
export type VoteWeightDirtyMarkersData = { afterId?: string }
export type VoteWeightDispatchPage<T> = {
  window: VoteWeightDispatchWindow
  events: VoteWeightDispatchEvent[]
  continuation: T | null
  hasMore: boolean
}
