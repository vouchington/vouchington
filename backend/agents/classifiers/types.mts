import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { ClassifierDecisionScope } from '@services/classifiers'
import type { ClassifierChoiceKey, ClassifierSafeText } from './safe-content.mts'

export type ClassifierDecisionSubject =
  | { postId: string; rssFeedItemId: null }
  | { postId: null; rssFeedItemId: string }

export type TopicClassifierCandidate = {
  candidateKind: 'topic'
  topicId: string
  storedCandidateId: string | null
}

export type StoryClassifierCandidate = {
  candidateKind: 'story'
  storyId: string
  storedCandidateId: string | null
}

/**
 * A standalone RSS feed item scored as a story-clustering candidate. It shares the `story`
 * candidate family (the classifier's persisted `candidateKind`) with `StoryClassifierCandidate`.
 */
export type RssFeedItemClassifierCandidate = {
  candidateKind: 'rss_feed_item'
  rssFeedItemId: string
  storedCandidateId: null
}

/** One community moderation prompt; it has no stored candidate or threshold revision. */
export type CommunityPromptClassifierCandidate = {
  candidateKind: 'community_prompt'
  communityPromptId: string
  storedCandidateId: null
}

export type ClassifierDecisionCandidate =
  | TopicClassifierCandidate
  | StoryClassifierCandidate
  | RssFeedItemClassifierCandidate
  | CommunityPromptClassifierCandidate

export type NoulClassifierBinding = {
  type: 'noul'
  questionId: string
  question: ClassifierSafeText
  candidate: ClassifierDecisionCandidate
}

export type ChoiceClassifierCriterion = {
  criterion: ClassifierChoiceKey
  candidate: ClassifierDecisionCandidate | null
}

export type ChoiceClassifierBinding = {
  type: 'choice'
  questionId: string
  question: ClassifierSafeText
  criteria: readonly ChoiceClassifierCriterion[]
}

export type ClassifierQuestionBinding = NoulClassifierBinding | ChoiceClassifierBinding

export type ClassifierDecisionRequestInput = {
  batchId: string
  classifierId: string
  promptVersionId: string
  subject: ClassifierDecisionSubject
  scope: ClassifierDecisionScope
  state: ClassifierSafeText
  bindings: readonly ClassifierQuestionBinding[]
  client: StructuredDecisionClient
  signal?: AbortSignal
}

/** Input prepared before the classifier-run owner persists its durable receipt. */
export type ExecuteSingleCallClassifierDecisionInput = ClassifierDecisionRequestInput
