import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'
import type { BenchmarkConfig } from './benchmark-config.mts'
import { modeledCurrentCost, observedJevCost } from './benchmark-cost.mts'
import type { StructuredDecisionClient, StructuredDecisionRequest } from './types.mts'

export type BenchmarkObservation = {
  success: boolean
  durationMs: number
  anchorProbability?: number
  usage?: Readonly<Record<string, unknown>> | null
  costUsd?: { jev: number | null; modeledCurrent: number }
  error?: string
}

export type BenchmarkSeries = {
  name: string
  candidateCount: number
  observations: BenchmarkObservation[]
  anchorDriftWithinTrials: number | null
  anchorDriftFromSmallestDynamic: number | null
}

export type BenchmarkReport = {
  configured: Pick<BenchmarkConfig, 'trials' | 'dynamicCounts' | 'rates' | 'assumptions'>
  termination:
    | { kind: 'measured-first-failure'; candidateCount: number }
    | { kind: 'succeeded-through-operator-cap'; candidateCount: number | null }
  series: BenchmarkSeries[]
}

export async function runBenchmark(
  config: BenchmarkConfig,
  client: StructuredDecisionClient,
  now: () => number = () => performance.now(),
): Promise<BenchmarkReport> {
  const state = Array.from(
    { length: 60 },
    () => 'A traveler describes a rewards program experience with concrete dates and details.',
  ).join(' ')
  const moderationQuestions: StructuredDecisionRequest['questions'][number][] = []
  for (const moderator of MODERATOR_CONFIGS) {
    if (moderator.slug !== 'ai-generated')
      moderationQuestions.push({
        id: moderator.slug,
        type: 'noul',
        question: moderator.prompt,
      })
  }
  const scenarios = [
    {
      name: 'moderation-fixed-six',
      request: { state, questions: moderationQuestions },
      currentCalls: 6,
      repeatInstructions: false,
    },
    {
      name: 'community-custom-ten',
      request: dynamicRequest(state, 10, 'community custom moderation prompt'),
      currentCalls: 10,
      repeatInstructions: false,
    },
    ...config.dynamicCounts.map(count => ({
      name: `dynamic-tagging-${count}`,
      request: dynamicRequest(state, count, 'embedding-prefiltered topic'),
      currentCalls: 10,
      repeatInstructions: true,
    })),
  ]
  const series: BenchmarkSeries[] = []

  async function measureScenario(index: number): Promise<void> {
    const scenario = scenarios[index]
    if (!scenario) return
    const observations: BenchmarkObservation[] = []
    async function measureTrial(trial: number): Promise<void> {
      if (trial >= config.trials) return
      observations.push(await measure(client, config, scenario, now))
      await measureTrial(trial + 1)
    }
    await measureTrial(0)
    const anchors = observations.flatMap(observation =>
      typeof observation.anchorProbability === 'number' ? [observation.anchorProbability] : [],
    )
    series.push({
      name: scenario.name,
      candidateCount: scenario.request.questions.length,
      observations,
      anchorDriftWithinTrials:
        anchors.length < 2 ? null : Math.max(...anchors) - Math.min(...anchors),
      anchorDriftFromSmallestDynamic: null,
    })
    if (scenario.name.startsWith('dynamic-tagging-') && observations.some(value => !value.success))
      return
    await measureScenario(index + 1)
  }
  await measureScenario(0)

  const dynamicBaseline = meanAnchor(
    series.find(entry => entry.name.startsWith('dynamic-tagging-')),
  )
  for (const entry of series) {
    const mean = meanAnchor(entry)
    entry.anchorDriftFromSmallestDynamic =
      !entry.name.startsWith('dynamic-tagging-') || mean === null || dynamicBaseline === null
        ? null
        : Math.abs(mean - dynamicBaseline)
  }
  const failedDynamic = series.find(
    entry =>
      entry.name.startsWith('dynamic-tagging-') && entry.observations.some(value => !value.success),
  )
  const lastDynamic = series.findLast(entry => entry.name.startsWith('dynamic-tagging-'))
  return {
    configured: {
      trials: config.trials,
      dynamicCounts: config.dynamicCounts,
      rates: config.rates,
      assumptions: config.assumptions,
    },
    termination: failedDynamic
      ? { kind: 'measured-first-failure', candidateCount: failedDynamic.candidateCount }
      : {
          kind: 'succeeded-through-operator-cap',
          candidateCount: lastDynamic?.candidateCount ?? null,
        },
    series,
  }
}

async function measure(
  client: StructuredDecisionClient,
  config: BenchmarkConfig,
  scenario: {
    request: StructuredDecisionRequest
    currentCalls: number
    repeatInstructions: boolean
  },
  now: () => number,
): Promise<BenchmarkObservation> {
  const startedAt = now()
  try {
    const result = await client.decide(scenario.request)
    const anchor = result.answers[0]
    if (anchor?.type !== 'noul') throw new Error('Benchmark anchor was not Noul.')
    return {
      success: true,
      durationMs: Math.round(now() - startedAt),
      anchorProbability: anchor.probability,
      usage: result.usage,
      costUsd: {
        jev: observedJevCost(config, result),
        modeledCurrent: modeledCurrentCost(
          config,
          scenario.request,
          scenario.currentCalls,
          scenario.repeatInstructions,
        ),
      },
    }
  } catch (error) {
    return {
      success: false,
      durationMs: Math.round(now() - startedAt),
      error: error instanceof Error ? error.message : 'Unknown benchmark failure.',
    }
  }
}

function dynamicRequest(state: string, count: number, subject: string): StructuredDecisionRequest {
  return {
    state,
    questions: Array.from({ length: count }, (_, index) => ({
      id: `candidate-${index}`,
      type: 'noul',
      question: `Decide whether this item matches ${subject} ${index}: ${'specific candidate context '.repeat(10)}`,
    })),
  }
}

function meanAnchor(entry?: BenchmarkSeries): number | null {
  const values = entry?.observations.flatMap(observation =>
    typeof observation.anchorProbability === 'number' ? [observation.anchorProbability] : [],
  )
  return values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
