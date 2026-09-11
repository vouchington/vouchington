export type VoteWeightJobs =
  | 'processRecalculateUserVoteWeight'
  | 'processRecalculateVoteWeightDispatcher'

export type ProcessRecalculateUserVoteWeightData = {
  userId: string
  forceRecalculate?: boolean
}

export type ProcessRecalculateVoteWeightDispatcherData = {
  afterId?: string | null
}

export type VoteWeightJobData =
  | { name: 'processRecalculateUserVoteWeight'; data: ProcessRecalculateUserVoteWeightData }
  | {
      name: 'processRecalculateVoteWeightDispatcher'
      data: ProcessRecalculateVoteWeightDispatcherData
    }
