export type VoteIntegrityJobs = 'processVoteIntegrityCheck'

export type ProcessVoteIntegrityCheckData = {
  entityType: string
  entityId: string
  userId: string
  ipAddress: string | null
  score: number
}

export type VoteIntegrityJobData = {
  name: 'processVoteIntegrityCheck'
  data: ProcessVoteIntegrityCheckData
}
