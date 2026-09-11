export type UserDeletionJobs = 'processUserDeletion' | 'recoverUserDeletions'

export type UserDeletionJobData = {
  requestId: string
  processingAttemptId: string
}

export type UserDeletionEnqueueData = UserDeletionJobData & { delayMs?: number }
