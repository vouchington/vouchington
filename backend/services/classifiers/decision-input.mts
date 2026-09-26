import type {
  ClassifierDecisionInputResult,
  PersistClassifierDecisionCall,
  PersistClassifierDecisionInput,
} from './types.mts'
import { isUUID } from '@modules/utils/ids'

export type NormalizedClassifierDecisionInput = PersistClassifierDecisionInput & {
  calls: readonly (PersistClassifierDecisionCall & {
    results: readonly ClassifierDecisionInputResult[]
  })[]
}

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ClassifierCandidateFamily = 'topic' | 'story'

/**
 * `rss_feed_item` is a candidate *shape* within the story family (a standalone
 * item that would become a new story), never its own classifier family: the
 * DB-level `classifier_candidate_kind` enum and a classifier row's own
 * `candidate_kind` stay `'topic' | 'story'`. This maps a result/candidate's own
 * kind to the family its classifier row belongs to.
 */
export function classifierCandidateFamily(
  candidateKind: 'topic' | 'story' | 'rss_feed_item',
): ClassifierCandidateFamily {
  switch (candidateKind) {
    case 'topic':
      return 'topic'
    case 'story':
    case 'rss_feed_item':
      return 'story'
    default: {
      const exhaustive: never = candidateKind
      throw new Error(`Unhandled classifier candidate kind: ${String(exhaustive)}`)
    }
  }
}

export function normalizeClassifierDecisionInput(
  input: PersistClassifierDecisionInput,
): NormalizedClassifierDecisionInput {
  if (!UUID_V7_PATTERN.test(input.batchId)) {
    throw new Error('Classifier decision batch ID must be UUIDv7')
  }
  const durableIds = [input.classifierId, input.promptVersionId]
  if (input.subject.postId) durableIds.push(input.subject.postId)
  if (input.subject.rssFeedItemId) durableIds.push(input.subject.rssFeedItemId)
  if (input.scope.scopeCommunityId) durableIds.push(input.scope.scopeCommunityId)
  for (const result of input.calls.flatMap(call => call.results)) {
    durableIds.push(classifierResultEntityId(result))
    if (result.storedCandidateId) durableIds.push(result.storedCandidateId)
  }
  if (durableIds.some(id => !isUUID(id))) {
    throw new Error('Classifier decision durable IDs must be UUIDs')
  }
  if (Boolean(input.subject.postId) === Boolean(input.subject.rssFeedItemId)) {
    throw new Error('Classifier decision batch must have exactly one subject')
  }
  if (input.scope.scopeCategory === 'global' && input.scope.scopeCommunityId !== null) {
    throw new Error('Global classifier decision batches cannot name a community')
  }
  if (input.scope.scopeCategory === 'community_ai' && !input.scope.scopeCommunityId) {
    throw new Error('Community classifier decision batches require a community')
  }
  if (input.calls.length === 0) {
    throw new Error('Classifier decision requires at least one provider call')
  }
  assertDecisionCalls(input.calls)
  return input as NormalizedClassifierDecisionInput
}

export function classifierDecisionCandidateKind(
  input: Pick<NormalizedClassifierDecisionInput, 'calls'>,
): ClassifierCandidateFamily {
  const firstResult = input.calls[0]?.results[0]
  if (!firstResult) throw new Error('Classifier decision requires a candidate result')
  return classifierCandidateFamily(firstResult.candidateKind)
}

export function flattenClassifierDecisionResults(
  input: Pick<NormalizedClassifierDecisionInput, 'calls'>,
): readonly ClassifierDecisionInputResult[] {
  return input.calls.flatMap(call => call.results)
}

export function classifierResultEntityId(result: ClassifierDecisionInputResult): string {
  switch (result.candidateKind) {
    case 'topic':
      return result.topicId
    case 'story':
      return result.storyId
    case 'rss_feed_item':
      return result.rssFeedItemId
    default: {
      const exhaustive: never = result
      throw new Error(`Unhandled classifier result candidate kind: ${String(exhaustive)}`)
    }
  }
}

export function classifierDecisionResultKey(result: ClassifierDecisionInputResult): string {
  return `${result.candidateKind}:${classifierResultEntityId(result)}`
}

export function serializeClassifierRawResponse(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value))
}

function assertDecisionCalls(calls: readonly PersistClassifierDecisionCall[]): void {
  const resultKeys = new Set<string>()
  const storedCandidateIds = new Set<string>()
  let family: ClassifierCandidateFamily | undefined
  for (const [index, call] of calls.entries()) {
    if (call.shardOrdinal !== index || call.results.length === 0) {
      throw new Error('Classifier decision calls must have consecutive non-empty shard ordinals')
    }
    for (const result of call.results) {
      assertDecisionResult(result)
      family ??= classifierCandidateFamily(result.candidateKind)
      if (family !== classifierCandidateFamily(result.candidateKind)) {
        throw new Error('Classifier decision cannot mix topic and story candidates')
      }
      const key = classifierDecisionResultKey(result)
      if (resultKeys.has(key)) {
        throw new Error('Classifier decision cannot duplicate a candidate result')
      }
      resultKeys.add(key)
      if (result.storedCandidateId && storedCandidateIds.has(result.storedCandidateId)) {
        throw new Error('Classifier decision cannot duplicate a stored candidate')
      }
      if (result.storedCandidateId) storedCandidateIds.add(result.storedCandidateId)
    }
  }
}

function assertDecisionResult(result: ClassifierDecisionInputResult): void {
  if (!Number.isFinite(result.probability) || result.probability < 0 || result.probability > 1) {
    throw new Error('Classifier result probability must be between zero and one')
  }
  serializeClassifierRawResponse(result.rawResponse)
}

function normalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Classifier raw response must be JSON serializable')
    return value
  }
  if (Array.isArray(value)) return value.map(normalizeJsonValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJsonValue(child)]),
    )
  }
  throw new Error('Classifier raw response must be JSON serializable')
}
