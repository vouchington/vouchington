import type {
  StructuredDecisionClient,
  StructuredDecisionRequest,
} from '@modules/structured-decisions'
import type {
  ActiveClassifierConfiguration,
  ClassifierDecisionScope,
  PersistClassifierDecisionInput,
  PersistClassifierDecisionResult,
} from '@services/classifiers'
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
 * A standalone RSS feed item offered as a Choice criterion alongside existing-story
 * criteria in a story-family classifier decision. Never a stored/pre-registered
 * candidate (`classifier_candidates` only ever holds topics and stories), so
 * `storedCandidateId` is always null. See docs/requirements/content/reference-stories-clustering-algorithm.md.
 */
export type RssFeedItemClassifierCandidate = {
  candidateKind: 'rss_feed_item'
  rssFeedItemId: string
  storedCandidateId: null
}

export type ClassifierDecisionCandidate =
  | TopicClassifierCandidate
  | StoryClassifierCandidate
  | RssFeedItemClassifierCandidate

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

export type TypesafeClassifierContextPolicy = {
  transport: 'typesafe'
  model: string
  measure: (request: StructuredDecisionRequest) => {
    totalTokens: number
    stateAndLongestQuestionTokens: number
  }
}

export type OpenRouterClassifierContextPolicy = {
  transport: 'openrouter'
  model: string
  measure: (request: StructuredDecisionRequest) => { totalTokens: number }
}

export type ClassifierContextPolicy =
  | TypesafeClassifierContextPolicy
  | OpenRouterClassifierContextPolicy

export type ClassifierDecisionRequestInput = {
  batchId: string
  classifierId: string
  promptVersionId: string
  subject: ClassifierDecisionSubject
  scope: ClassifierDecisionScope
  state: ClassifierSafeText
  bindings: readonly ClassifierQuestionBinding[]
  contextPolicy?: ClassifierContextPolicy
  client: StructuredDecisionClient
  signal?: AbortSignal
}

export type ExecuteClassifierDecisionInput = ClassifierDecisionRequestInput & {
  contextPolicy: ClassifierContextPolicy
}

/**
 * Input for `executeSingleCallClassifierDecision`, the sharding-free twin of
 * `executeClassifierDecision` for classifier families with no exact context
 * measurer. It omits `contextPolicy` entirely rather than accepting one that
 * would never be consulted; see `docs/overview/architecture/structured-decisions.md`.
 */
export type ExecuteSingleCallClassifierDecisionInput = Omit<
  ClassifierDecisionRequestInput,
  'contextPolicy'
>

export type ExecuteClassifierDecisionDependencies = {
  getActiveClassifierConfiguration?: (
    classifierId: string,
  ) => Promise<ActiveClassifierConfiguration | null>
  persistClassifierDecision?: (
    input: PersistClassifierDecisionInput,
  ) => Promise<PersistClassifierDecisionResult>
}
