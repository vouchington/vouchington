import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  createStructuredDecisionClient,
  type StructuredDecisionClient,
} from '@modules/structured-decisions'

export type ClassifierDecisionBand = 'below-lower' | 'between' | 'at-or-above-upper'

export type ClassifierGoldenExpectation = {
  acceptableBands: readonly ClassifierDecisionBand[]
  rationale: string
}

export type ClassifierGoldenFixture = {
  id: string
  subjectKind: 'post' | 'rss-feed-item'
  state: string
  candidateSlate: 'production-post-classifier-catalog' | readonly string[]
  rationale: string
  expected: Readonly<Record<string, ClassifierGoldenExpectation>>
}

export type ClassifierGoldenCandidate = {
  key: string
  thresholdRevision: string
  thresholds: { lower: number; upper: number }
}

export type ClassifierGoldenCase = {
  fixture: ClassifierGoldenFixture
  candidates: Readonly<Record<string, ClassifierGoldenCandidate>>
  decide: (
    client: StructuredDecisionClient,
  ) => Promise<readonly { candidateId: string; probability: number }[]>
}

export type ClassifierGoldenPolicy = {
  minimumFixturesPerCandidate: number
  toleratedUnexpectedFixturesPerCandidate: number
}

export function classifierGoldenBatchId(): string {
  const randomUuid = randomUUID()
  return `${randomUuid.slice(0, 14)}7${randomUuid.slice(15)}`
}

type CallCounter = { count: number }

function clientWithCallCounter(client: StructuredDecisionClient, counter: CallCounter) {
  return {
    decide: async (request: Parameters<typeof client.decide>[0], signal?: AbortSignal) => {
      counter.count += 1
      return client.decide(request, signal)
    },
  }
}

export function unexpectedClassifierGoldenBand(
  fixture: ClassifierGoldenFixture,
  candidate: ClassifierGoldenCandidate,
  probability: number,
): string | null {
  const expectation = fixture.expected[candidate.key]
  if (!expectation) {
    return `${fixture.id} candidate ${candidate.key} threshold ${candidate.thresholdRevision}: missing expected band`
  }
  const band = decisionBand(probability, candidate.thresholds)
  if (expectation.acceptableBands.includes(band)) return null
  return (
    `${fixture.id} candidate ${candidate.key} threshold ${candidate.thresholdRevision}: ` +
    `expected ${expectation.acceptableBands.join('|')}, received ${band} ` +
    `(fixture rationale: ${expectation.rationale}; score ${probability})`
  )
}

export function missingOrDuplicateClassifierGoldenResults(
  fixtureId: string,
  expectedCandidateIds: readonly string[],
  actualCandidateIds: readonly string[],
): string[] {
  const actualCounts = new Map<string, number>()
  for (const candidateId of actualCandidateIds) {
    actualCounts.set(candidateId, (actualCounts.get(candidateId) ?? 0) + 1)
  }
  return expectedCandidateIds.flatMap(candidateId => {
    const count = actualCounts.get(candidateId) ?? 0
    return count === 1
      ? []
      : [
          `${fixtureId}: expected exactly one result for candidate ${candidateId}, received ${count}`,
        ]
  })
}

export async function runClassifierGoldenSet(
  cases: readonly ClassifierGoldenCase[],
  policy: ClassifierGoldenPolicy,
): Promise<void> {
  const startedAt = performance.now()
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  const client = createStructuredDecisionClient({ transport: 'openrouter', apiKey })
  const callCounter: CallCounter = { count: 0 }
  const failures: string[] = []
  const fixtureCounts = new Map<string, number>()
  const unexpectedCounts = new Map<string, number>()
  const unexpectedDetails = new Map<string, string[]>()
  let toleratedUnexpectedCount = 0

  for (const { fixture, candidates, decide } of cases) {
    const results = await decide(clientWithCallCounter(client, callCounter))
    const resultCandidateIds: string[] = []
    for (const result of results) {
      resultCandidateIds.push(result.candidateId)
      const candidate = candidates[result.candidateId]
      if (!candidate) {
        failures.push(`${fixture.id}: unregistered candidate ${result.candidateId}`)
        continue
      }
      fixtureCounts.set(candidate.key, (fixtureCounts.get(candidate.key) ?? 0) + 1)
      const mismatch = unexpectedClassifierGoldenBand(fixture, candidate, result.probability)
      if (mismatch) {
        unexpectedCounts.set(candidate.key, (unexpectedCounts.get(candidate.key) ?? 0) + 1)
        const details = unexpectedDetails.get(candidate.key) ?? []
        details.push(mismatch)
        unexpectedDetails.set(candidate.key, details)
      }
    }
    failures.push(
      ...missingOrDuplicateClassifierGoldenResults(
        fixture.id,
        Object.keys(candidates),
        resultCandidateIds,
      ),
    )
  }

  if (callCounter.count !== cases.length) {
    failures.push(`expected ${cases.length} provider calls, received ${callCounter.count}`)
  }
  for (const key of new Set(
    cases.flatMap(testCase => Object.values(testCase.candidates).map(candidate => candidate.key)),
  )) {
    const count = fixtureCounts.get(key) ?? 0
    if (count < policy.minimumFixturesPerCandidate) {
      failures.push(
        `candidate ${key} has ${count} fixtures; minimum is ${policy.minimumFixturesPerCandidate}`,
      )
    }
    const unexpected = unexpectedCounts.get(key) ?? 0
    toleratedUnexpectedCount += Math.min(unexpected, policy.toleratedUnexpectedFixturesPerCandidate)
    if (unexpected > policy.toleratedUnexpectedFixturesPerCandidate) {
      failures.push(
        `candidate ${key} has ${unexpected} unexpected fixtures; tolerance is ${policy.toleratedUnexpectedFixturesPerCandidate}: ${unexpectedDetails.get(key)?.join('; ')}`,
      )
    }
  }

  console.info(
    `Classifier golden set: ${callCounter.count} OpenRouter calls, ${toleratedUnexpectedCount} tolerated band changes, ${Math.round(performance.now() - startedAt)}ms`,
  )
  if (failures.length > 0) throw new Error(failures.join('\n'))
}

function decisionBand(
  probability: number,
  thresholds: { lower: number; upper: number },
): ClassifierDecisionBand {
  if (probability < thresholds.lower) return 'below-lower'
  if (probability >= thresholds.upper) return 'at-or-above-upper'
  return 'between'
}
