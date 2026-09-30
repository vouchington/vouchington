import type {
  PersistClassifierDecisionInput,
  PersistedClassifierDecision,
} from '@services/classifiers/types'
import type { ClassifierRunLease, RemotePlan } from './types.mts'

type DecisionSubject = PersistClassifierDecisionInput['subject']

function remotePlan<C>(lease: ClassifierRunLease<C>): RemotePlan {
  const remote = lease.resolved.remote
  if (!remote || lease.decisionBatchId === null) {
    throw new Error('Local-only classifier run cannot have a remote decision')
  }
  return remote
}

type ExpectedCandidate = { thresholdId: string | null; lower: number; upper: number } | null

/**
 * The exact candidates a run may ask about, keyed by topic and stored candidate. Pinned candidates
 * carry the thresholds the configuration froze. Captured topics carry none: they have no stored
 * candidate and are judged by the thresholds the decision itself recorded.
 */
function expectedCandidates<C>(lease: ClassifierRunLease<C>): Map<string, ExpectedCandidate> {
  const remote = remotePlan(lease)
  if (remote.capturedCandidates) {
    return new Map(lease.capturedTopicIds.map(topicId => [`${topicId}:`, null]))
  }
  return new Map(
    remote.candidates.map(candidate => [
      `${candidate.topicId}:${candidate.candidateId}`,
      candidate,
    ]),
  )
}

function sameSubject(subject: DecisionSubject, expected: ClassifierRunLease<unknown>['subject']) {
  return subject.postId === expected.postId && subject.rssFeedItemId === expected.rssFeedItemId
}

function isGlobal(scope: { scopeCategory: string; scopeCommunityId: string | null }): boolean {
  return scope.scopeCategory === 'global' && scope.scopeCommunityId === null
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
    !isGlobal(decision.scope)
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
    const key =
      result.candidateKind === 'topic' ? `${result.topicId}:${result.storedCandidateId ?? ''}` : ''
    if (result.candidateKind !== 'topic' || !expected.has(key) || seen.has(key)) {
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
    !isGlobal(decision.scope)
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
    if (result.candidateKind !== 'topic') {
      throw new Error('classifier run remote decision contains a non-topic result')
    }
    const key = `${result.topicId}:${result.storedCandidateId ?? ''}`
    if (
      !expected.has(key) ||
      seen.has(key) ||
      !callIds.has(result.decisionCallId) ||
      result.batchId !== decision.batchId ||
      result.classifierId !== remote.classifierId ||
      result.promptVersionId !== remote.promptVersionId ||
      !matchesExpectedThresholds(expected.get(key) ?? null, result) ||
      !isGlobal(result.scope)
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
