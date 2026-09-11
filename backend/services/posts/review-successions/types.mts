export type ReviewSuccession = {
  id: string
  predecessor_post_id: string
  successor_post_id: string
  author_user_id: string
  topic_ids: string[]
  predecessor_archived_at: Date
  automatically_restored_at: Date | null
  manual_override_at: Date | null
}

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
