import { classifyArtifact } from './cleanup-artifacts-patterns.mts'
import {
  isSweepCandidate as isSweepCandidateWithClassify,
  nextPagingState,
  planRunDeletions as planRunDeletionsWithClassify,
  planSweepDeletions,
  shouldStopPaging,
  summarize,
  type ArtifactLike,
  type DeletionSummary,
  type PagingState,
} from 'vouchington-tooling/gha-artifacts-cleanup'

export type { ArtifactLike, DeletionSummary, PagingState }
export { nextPagingState, planSweepDeletions, shouldStopPaging, summarize }

export function planRunDeletions(artifacts: ArtifactLike[]): ArtifactLike[] {
  return planRunDeletionsWithClassify(artifacts, classifyArtifact)
}

export function isSweepCandidate(artifact: ArtifactLike, cutoffIso: string): boolean {
  return isSweepCandidateWithClassify(artifact, cutoffIso, classifyArtifact)
}
