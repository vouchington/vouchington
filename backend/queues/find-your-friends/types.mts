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

export type FindYourFriendsJobPayloads = {
  dispatchFindYourFriends: FriendsDispatchData
  syncFacebookFriends: { facebookAccountId: string; resume?: FriendSyncResume }
  syncXFriends: { xAccountId: string; resume?: FriendSyncResume }
  syncGithubFriends: { githubAccountId: string; resume?: FriendSyncResume }
}

export type FindYourFriendsDispatcherJobs = 'dispatchFindYourFriends'

export type FindYourFriendsSyncJobs = Exclude<
  keyof FindYourFriendsJobPayloads,
  FindYourFriendsDispatcherJobs
>
