export type { UserElectionFanOutCursor } from '@queues/background/enqueues/vote-aggregation-jobs'

export type ProcessRecalculateUserVoteWeightData = {
  userId: string
  forceRecalculate?: boolean
}

export type ProcessRecalculateVoteWeightDispatcherData = {
  afterId?: string | null
}
