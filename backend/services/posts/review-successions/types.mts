export type ReviewSuccessionReconciliationResult = {
  changedPostIds: string[]
}

export type ReviewSuccessionGroup = {
  authorUserId: string
  topicIds: string[]
}

export type ReviewSuccessionCandidate = ReviewSuccessionGroup & {
  id: string
  archivedAt: Date | null
  isPublic: boolean
  isOtherwisePublic: boolean
  successionId: string | null
  successionTopicIds: string[] | null
}

export type ReviewSuccessionArchive = ReviewSuccessionGroup & {
  predecessorPostId: string
  successorPostId: string
}

export type ReviewSuccessionRestoration = ReviewSuccessionGroup & {
  postId: string
  successionId: string
  successionTopicIds: string[]
}
