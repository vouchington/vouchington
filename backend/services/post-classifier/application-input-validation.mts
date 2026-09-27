import type { PersistClassifierDecisionInput } from '@services/classifiers/types'
import type { PostClassifierApplicationLease } from './application-identity.mts'

export function assertRemoteInputCandidates(
  lease: PostClassifierApplicationLease,
  decision: PersistClassifierDecisionInput,
): void {
  const expected = new Set(
    lease.resolved.configuration.remote!.questions.map(
      question => `${question.topicId}:${question.candidateId}`,
    ),
  )
  const results = decision.calls.flatMap(call => call.results)
  const seen = new Set<string>()
  if (decision.calls.length !== 1 || results.length !== expected.size) {
    throw new Error('post classifier remote input does not cover its exact configured candidates')
  }
  for (const result of results) {
    const key =
      result.candidateKind === 'topic' ? `${result.topicId}:${result.storedCandidateId ?? ''}` : ''
    if (result.candidateKind !== 'topic' || !expected.has(key) || seen.has(key)) {
      throw new Error('post classifier remote input candidate lineage does not match its receipt')
    }
    seen.add(key)
  }
}
