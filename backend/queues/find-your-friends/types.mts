export type FindYourFriendsDispatcherJobs = 'dispatchFindYourFriends'

export type FindYourFriendsSyncJobs = 'syncFacebookFriends' | 'syncXFriends' | 'syncGithubFriends'

export type FriendsDispatchData = {
  sweepStartedAt?: string
  upperIds?: Record<'facebook' | 'x' | 'github', string | null>
  afterIds?: Partial<Record<'facebook' | 'x' | 'github', string>>
  finishedProviders?: ('facebook' | 'x' | 'github')[]
}

/** Where one friend sync run stopped; the follow-up job resumes the same sync under the same start time. */
export type FriendSyncResume = {
  phase: 'pages' | 'finalize'
  syncStartTime: string
  /** Pages phase: Facebook after cursor, GitHub page number, X pagination token. Finalize phase: last deleted stale friend id. */
  cursor?: string
}
