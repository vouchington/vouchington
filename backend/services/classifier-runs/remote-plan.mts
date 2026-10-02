import type { RemotePlan, TopicRemotePlan } from './types.mts'

/** True when the plan's topic candidates are captured at reservation instead of pinned. */
export function capturesCandidates(
  remote: RemotePlan | null | undefined,
): remote is TopicRemotePlan & { capturedCandidates: true } {
  return remote?.candidateKind === 'topic' && remote.capturedCandidates
}

/**
 * Which candidates the run chooses when its receipt is reserved: topics for a plan that does not
 * pin them, always stories for story clustering, none for a pinned or prompt-only plan.
 */
export function capturedCandidateKind(
  remote: RemotePlan | null | undefined,
): 'topic' | 'story' | null {
  if (remote?.candidateKind === 'story') return 'story'
  return capturesCandidates(remote) ? 'topic' : null
}

/** The stored candidate rows the decision batch pins at reservation; only topic plans have any. */
export function pinnedStoredCandidateIds(remote: RemotePlan): readonly string[] {
  return remote.candidateKind === 'topic'
    ? remote.candidates.map(candidate => candidate.candidateId)
    : []
}
