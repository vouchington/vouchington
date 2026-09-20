import type {
  ClassifierCandidateKind,
  ClassifierModelProvider,
  ClassifierPrimitive,
  ClassifierThresholds,
} from '@voucha/types'

export type ActiveClassifierConfiguration = {
  classifierId: string
  primitive: ClassifierPrimitive
  candidateKind: ClassifierCandidateKind
  promptVersionId: string
  prompt: string
  modelName: string
  modelProvider: ClassifierModelProvider
  defaultThresholds: ClassifierThresholds
}

export type ClassifierDecisionScope =
  | { scopeCategory: 'global'; scopeCommunityId: null }
  | { scopeCategory: 'community_ai'; scopeCommunityId: string }

type PersistedDecisionResultBase = {
  probability: number
  rawResponse: unknown
}

export type TopicClassifierDecisionResult = PersistedDecisionResultBase & {
  candidateKind: 'topic'
  topicId: string
  storedCandidateId: string | null
}

export type StoryClassifierDecisionResult = PersistedDecisionResultBase & {
  candidateKind: 'story'
  storyId: string
  storedCandidateId: string | null
}

export type ClassifierDecisionInputResult =
  | TopicClassifierDecisionResult
  | StoryClassifierDecisionResult

export type PersistClassifierDecisionCall = {
  shardOrdinal: number
  results: readonly ClassifierDecisionInputResult[]
}

export type PersistClassifierDecisionInput = {
  batchId: string
  classifierId: string
  promptVersionId: string
  scope: ClassifierDecisionScope
  subject: { postId: string; rssFeedItemId: null } | { postId: null; rssFeedItemId: string }
  calls: readonly PersistClassifierDecisionCall[]
}

export type PersistedClassifierDecisionResult =
  | (TopicClassifierDecisionResult & {
      id: string
      batchId: string
      decisionCallId: string
      classifierId: string
      promptVersionId: string
      thresholdId: string | null
      effectiveThresholds: ClassifierThresholds
      scope: ClassifierDecisionScope
    })
  | (StoryClassifierDecisionResult & {
      id: string
      batchId: string
      decisionCallId: string
      classifierId: string
      promptVersionId: string
      thresholdId: string | null
      effectiveThresholds: ClassifierThresholds
      scope: ClassifierDecisionScope
    })

export type PersistedClassifierDecisionCall = {
  id: string
  shardOrdinal: number
}

export type PersistedClassifierDecision = {
  batchId: string
  classifierId: string
  promptVersionId: string
  scope: ClassifierDecisionScope
  subject: { postId: string; rssFeedItemId: null } | { postId: null; rssFeedItemId: string }
  calls: readonly PersistedClassifierDecisionCall[]
  results: readonly PersistedClassifierDecisionResult[]
}

export type PersistClassifierDecisionResult = {
  decision: PersistedClassifierDecision
  replayed: boolean
}
