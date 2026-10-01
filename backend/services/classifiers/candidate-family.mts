import type { ClassifierCandidateKind } from '@voucha/types'
import type { ClassifierDecisionInputResult } from './types.mts'

type ClassifierResultCandidateKind = ClassifierDecisionInputResult['candidateKind']

const CANDIDATE_FAMILY = {
  topic: 'topic',
  story: 'story',
  // A standalone RSS item is a story-clustering candidate: it is stored in the `story` result
  // table next to story candidates, discriminated by which entity column is set.
  rss_feed_item: 'story',
  community_prompt: 'community_prompt',
} as const satisfies Record<ClassifierResultCandidateKind, ClassifierCandidateKind>

/** The persisted `classifiers.candidate_kind` a concrete result kind belongs to. */
export function classifierCandidateKindFamily(
  kind: ClassifierResultCandidateKind,
): ClassifierCandidateKind {
  return CANDIDATE_FAMILY[kind]
}
