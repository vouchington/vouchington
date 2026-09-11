import type {
  ReviewSuccessionArchive,
  ReviewSuccessionCandidate,
  ReviewSuccessionRestoration,
} from './types.mts'

export type ReviewSuccessionMutationPlan = {
  archives: ReviewSuccessionArchive[]
  restorations: ReviewSuccessionRestoration[]
}

/** Selects each exact-topic group's latest public-or-automatically-archived eligible review. */
export function planReviewSuccessionMutations(
  candidates: readonly ReviewSuccessionCandidate[],
): ReviewSuccessionMutationPlan {
  const grouped = new Map<string, ReviewSuccessionCandidate[]>()
  for (const candidate of candidates) {
    const key = `${candidate.authorUserId}:${candidate.topicIds.join(',')}`
    const group = grouped.get(key) ?? []
    group.push(candidate)
    grouped.set(key, group)
  }
  const archives: ReviewSuccessionArchive[] = []
  const restorations: ReviewSuccessionRestoration[] = []
  for (const group of grouped.values()) planGroup(group, archives, restorations)
  return { archives, restorations }
}

function planGroup(
  candidates: readonly ReviewSuccessionCandidate[],
  archives: ReviewSuccessionArchive[],
  restorations: ReviewSuccessionRestoration[],
): void {
  let winner: ReviewSuccessionCandidate | undefined
  for (const candidate of candidates) if (isQualifyingCandidate(candidate)) winner = candidate
  if (!winner) return
  if (winner.successionId && winner.archivedAt) {
    restorations.push({
      authorUserId: winner.authorUserId,
      topicIds: winner.topicIds,
      postId: winner.id,
      successionId: winner.successionId,
      successionTopicIds: winner.successionTopicIds ?? [],
    })
  }
  for (const candidate of candidates) {
    if (candidate.id >= winner.id || !candidate.isPublic) continue
    archives.push({
      authorUserId: winner.authorUserId,
      topicIds: winner.topicIds,
      predecessorPostId: candidate.id,
      successorPostId: winner.id,
    })
  }
}

function isQualifyingCandidate(candidate: ReviewSuccessionCandidate): boolean {
  return (
    candidate.isPublic ||
    (candidate.archivedAt !== null &&
      candidate.successionId !== null &&
      candidate.isOtherwisePublic)
  )
}
