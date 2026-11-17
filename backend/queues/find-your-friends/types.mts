export type FriendDispatchProvider = 'facebook' | 'x' | 'github'

/** One provider's fixed sweep window and the account id cursor where its walk continues. */
export type FriendsDispatchData = {
  sweepStartedAt?: string
  upperId?: string | null
  afterId?: string
}

/** Where one friend sync run stopped; the follow-up job resumes the same sync under the same start time. */
export type FriendSyncResume = {
  phase: 'pages' | 'finalize'
  syncStartTime: string
  /** Pages phase: Facebook after cursor, GitHub page number, X pagination token. Finalize phase: last deleted stale friend id. */
  cursor?: string
}

export type FindYourFriendsJobPayloads = {
  dispatchFacebookFriends: FriendsDispatchData
  dispatchXFriends: FriendsDispatchData
  dispatchGithubFriends: FriendsDispatchData
  syncFacebookFriends: { facebookAccountId: string; resume?: FriendSyncResume }
  syncXFriends: { xAccountId: string; resume?: FriendSyncResume }
  syncGithubFriends: { githubAccountId: string; resume?: FriendSyncResume }
}

export type FindYourFriendsDispatcherJobs =
  | 'dispatchFacebookFriends'
  | 'dispatchXFriends'
  | 'dispatchGithubFriends'

export type FindYourFriendsSyncJobs = Exclude<
  keyof FindYourFriendsJobPayloads,
  FindYourFriendsDispatcherJobs
>
