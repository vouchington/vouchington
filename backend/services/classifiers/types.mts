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

export type RssFeedItemClassifierDecisionResult = PersistedDecisionResultBase & {
  candidateKind: 'rss_feed_item'
  rssFeedItemId: string
  storedCandidateId: null
}

export type ClassifierDecisionInputResult =
  | TopicClassifierDecisionResult
  | StoryClassifierDecisionResult
  | RssFeedItemClassifierDecisionResult

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

type PersistedResultEnvelope = {
  id: string
  batchId: string
  decisionCallId: string
  classifierId: string
  promptVersionId: string
  thresholdId: string | null
  effectiveThresholds: ClassifierThresholds
  scope: ClassifierDecisionScope
}

export type PersistedClassifierDecisionResult =
  | (TopicClassifierDecisionResult & PersistedResultEnvelope)
  | (StoryClassifierDecisionResult & PersistedResultEnvelope)
  | (RssFeedItemClassifierDecisionResult & PersistedResultEnvelope)

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

export type ClassifierDecisionReuseErrorCode = 'input' | 'shard-ordinals' | 'results'

/**
 * Thrown by `persistClassifierDecision` when a batch ID already has a
 * committed decision whose identity, shard ordinals, or results do not
 * match the input being persisted. Callers that recover a completed batch
 * before dispatch (e.g. a C6-style receipt) can distinguish this from other
 * persistence failures by `instanceof` instead of string-matching `message`.
 */
export class ClassifierDecisionReuseError extends Error {
  readonly code: ClassifierDecisionReuseErrorCode

  constructor(code: ClassifierDecisionReuseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ClassifierDecisionReuseError'
    this.code = code
  }
}
