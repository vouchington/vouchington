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
  const plans = [...grouped.values()].map(planGroup)
  return {
    archives: plans.flatMap(plan => plan.archives),
    restorations: plans.flatMap(plan => plan.restorations),
  }
}

function planGroup(candidates: readonly ReviewSuccessionCandidate[]): ReviewSuccessionMutationPlan {
  let winner: ReviewSuccessionCandidate | undefined
  for (const candidate of candidates) if (isQualifyingCandidate(candidate)) winner = candidate
  if (!winner) return { archives: [], restorations: [] }
  const { authorUserId, topicIds, id: winnerId } = winner
  const restorations: ReviewSuccessionRestoration[] =
    winner.successionId && winner.archivedAt
      ? [
          {
            authorUserId,
            topicIds,
            postId: winnerId,
            successionId: winner.successionId,
            successionTopicIds: winner.successionTopicIds ?? [],
          },
        ]
      : []
  const archives: ReviewSuccessionArchive[] = candidates.flatMap(candidate =>
    candidate.id < winnerId && candidate.isPublic
      ? [{ authorUserId, topicIds, predecessorPostId: candidate.id, successorPostId: winnerId }]
      : [],
  )
  return { archives, restorations }
}

function isQualifyingCandidate(candidate: ReviewSuccessionCandidate): boolean {
  return (
    candidate.isPublic ||
    (candidate.archivedAt !== null &&
      candidate.successionId !== null &&
      candidate.isOtherwisePublic)
  )
}
