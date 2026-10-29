/** Queue-owned continuation for a bounded moderator scan; no authority survives in the cursor. */
export type UserPurgeCursor = {
  userId: string
  communityId: string
  afterModeratorId: string
}
export type UserPurgeResult = {
  deleted: number
  hasMore: boolean
  userPurge?: UserPurgeCursor
}
export type UserPurgeAfterCommit = () => Promise<void>
