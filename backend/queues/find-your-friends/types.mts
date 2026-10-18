export type FindYourFriendsDispatcherJobs = 'dispatchFindYourFriends'

export type FindYourFriendsSyncJobs = 'syncFacebookFriends' | 'syncXFriends' | 'syncGithubFriends'

export type FriendsDispatchData = {
  sweepStartedAt?: string
  upperIds?: Record<'facebook' | 'x' | 'github', string | null>
  afterIds?: Partial<Record<'facebook' | 'x' | 'github', string>>
  finishedProviders?: ('facebook' | 'x' | 'github')[]
}
