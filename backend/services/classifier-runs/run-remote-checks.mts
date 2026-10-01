import type {
  ClassifierDecisionInputResult,
  ClassifierDecisionScope,
  PersistClassifierDecisionInput,
  PersistedClassifierDecision,
  PersistedClassifierDecisionResult,
} from '@services/classifiers/types'
import { capturesCandidates } from './remote-plan.mts'
import type { ClassifierRunLease, RemotePlan } from './types.mts'

type DecisionSubject = PersistClassifierDecisionInput['subject']

function remotePlan<C>(lease: ClassifierRunLease<C>): RemotePlan {
  const remote = lease.resolved.remote
  if (!remote || lease.decisionBatchId === null) {
    throw new Error('Local-only classifier run cannot have a remote decision')
  }
  return remote
}

/** The candidate kind the run's reserved decision batch holds. */
export function remoteCandidateKind<C>(lease: ClassifierRunLease<C>): RemotePlan['candidateKind'] {
  return remotePlan(lease).candidateKind
}

/**
 * A run that captures its own candidates and has none left asks no question. The captured rows
 * cascade with their topic, so this means every topic the receipt captured has since been deleted:
 * there is nothing to ask and nothing to apply, so no provider call and no decision are needed.
 */
export function hasNoCapturedCandidates<C>(lease: ClassifierRunLease<C>): boolean {
  return capturesCandidates(lease.resolved.remote) && lease.capturedTopicIds.length === 0
}

type ExpectedCandidate = { thresholdId: string | null; lower: number; upper: number } | null

/**
 * The exact candidates a run may ask about, keyed by kind, entity and stored candidate. Pinned
 * topics carry the thresholds the configuration froze. Captured topics and community prompts carry
 * none: they have no stored candidate and are judged by the thresholds the decision recorded.
 */
function expectedCandidates<C>(lease: ClassifierRunLease<C>): Map<string, ExpectedCandidate> {
  const remote = remotePlan(lease)
  if (remote.candidateKind === 'community_prompt') {
    return new Map(remote.promptIds.map(promptId => [`community_prompt:${promptId}`, null]))
  }
  if (remote.capturedCandidates) {
    return new Map(lease.capturedTopicIds.map(topicId => [`topic:${topicId}:`, null]))
  }
  return new Map(
    remote.candidates.map(candidate => [
      `topic:${candidate.topicId}:${candidate.candidateId}`,
      candidate,
    ]),
  )
}

function resultKey(
  result: ClassifierDecisionInputResult | PersistedClassifierDecisionResult,
): string {
  switch (result.candidateKind) {
    case 'topic':
      return `topic:${result.topicId}:${result.storedCandidateId ?? ''}`
    case 'story':
      return `story:${result.storyId}`
    case 'community_prompt':
      return `community_prompt:${result.communityPromptId}`
  }
}

function sameSubject(subject: DecisionSubject, expected: ClassifierRunLease<unknown>['subject']) {
  return subject.postId === expected.postId && subject.rssFeedItemId === expected.rssFeedItemId
}

function sameScope(scope: ClassifierDecisionScope, expected: ClassifierDecisionScope): boolean {
  return (
    scope.scopeCategory === expected.scopeCategory &&
    scope.scopeCommunityId === expected.scopeCommunityId
  )
}

/** The remote call's batch, classifier, prompt, subject and scope must be the run's reservation. */
export function assertRemoteInputIdentity<C>(
  lease: ClassifierRunLease<C>,
  decision: PersistClassifierDecisionInput,
): void {
  const remote = remotePlan(lease)
  if (
    decision.batchId !== lease.decisionBatchId ||
    decision.classifierId !== remote.classifierId ||
    decision.promptVersionId !== remote.promptVersionId ||
    !sameSubject(decision.subject, lease.subject) ||
    !sameScope(decision.scope, remote.scope)
  ) {
    throw new Error('classifier run remote input does not match its receipt')
  }
}

/** The single call must cover exactly the run's reserved candidates, once each. */
export function assertRemoteInputCandidates<C>(
  lease: ClassifierRunLease<C>,
  decision: PersistClassifierDecisionInput,
): void {
  const expected = expectedCandidates(lease)
  const results = decision.calls.flatMap(call => call.results)
  if (decision.calls.length !== 1 || results.length !== expected.size) {
    throw new Error('classifier run remote input does not cover its exact reserved candidates')
  }
  const seen = new Set<string>()
  for (const result of results) {
    const key = resultKey(result)
    if (!expected.has(key) || seen.has(key)) {
      throw new Error('classifier run remote input candidate lineage does not match its receipt')
    }
    seen.add(key)
  }
}

/** A committed decision must carry the run's exact batch, thresholds and candidate lineage. */
export function assertPersistedDecisionMatchesRun<C>(
  lease: ClassifierRunLease<C>,
  decision: PersistedClassifierDecision,
): void {
  const remote = remotePlan(lease)
  if (
    decision.batchId !== lease.decisionBatchId ||
    decision.classifierId !== remote.classifierId ||
    decision.promptVersionId !== remote.promptVersionId ||
    !sameSubject(decision.subject, lease.subject) ||
    !sameScope(decision.scope, remote.scope)
  ) {
    throw new Error('classifier run remote decision identity does not match its receipt')
  }
  const expected = expectedCandidates(lease)
  if (decision.results.length !== expected.size || decision.calls.length !== 1) {
    throw new Error('classifier run remote decision does not cover its exact reserved candidates')
  }
  const callIds = new Set(decision.calls.map(call => call.id))
  const seen = new Set<string>()
  for (const result of decision.results) {
    const key = resultKey(result)
    if (
      !expected.has(key) ||
      seen.has(key) ||
      !callIds.has(result.decisionCallId) ||
      result.batchId !== decision.batchId ||
      result.classifierId !== remote.classifierId ||
      result.promptVersionId !== remote.promptVersionId ||
      !matchesExpectedThresholds(expected.get(key) ?? null, result) ||
      !sameScope(result.scope, remote.scope)
    ) {
      throw new Error('classifier run remote decision lineage does not match its receipt')
    }
    seen.add(key)
  }
}

function matchesExpectedThresholds(
  candidate: ExpectedCandidate,
  result: PersistedClassifierDecision['results'][number],
): boolean {
  return (
    candidate === null ||
    (result.thresholdId === candidate.thresholdId &&
      result.effectiveThresholds.lower === candidate.lower &&
      result.effectiveThresholds.upper === candidate.upper)
  )
}
