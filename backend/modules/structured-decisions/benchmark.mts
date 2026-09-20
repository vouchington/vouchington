import { chmod, writeFile } from 'node:fs/promises'
import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'
import { loadBenchmarkConfig } from './benchmark-config.mts'
import { calculateTokenCostUsd } from './cost-model.mts'
import { createStructuredDecisionClient } from './structured-decisions.mts'
import type { StructuredDecisionRequest } from './types.mts'

const { apiKey, outputPath, trials, dynamicCounts, rates, assumptions } = loadBenchmarkConfig()
const client = createStructuredDecisionClient({ transport: 'openrouter', apiKey })
const state = Array.from(
  { length: 60 },
  () => 'A traveler describes a rewards program experience with concrete dates and details.',
).join(' ')
const moderationQuestions: StructuredDecisionRequest['questions'][number][] = []
for (const config of MODERATOR_CONFIGS) {
  if (config.slug !== 'ai-generated')
    moderationQuestions.push({ id: config.slug, type: 'noul', question: config.prompt })
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
    request: dynamicRequest(10, 'community custom moderation prompt'),
    currentCalls: 10,
    repeatInstructions: false,
  },
  ...dynamicCounts.map(count => ({
    name: `dynamic-tagging-${count}`,
    request: dynamicRequest(count, 'embedding-prefiltered topic'),
    currentCalls: 10,
    repeatInstructions: true,
  })),
]
type Observation = {
  success: boolean
  durationMs: number
  anchorProbability?: number
  usage?: Readonly<Record<string, unknown>> | null
  costUsd?: { jev: number | null; modeledCurrent: number }
  error?: string
}
type Series = {
  name: string
  candidateCount: number
  observations: Observation[]
  anchorDriftWithinTrials: number | null
  anchorDriftFromSmallestDynamic: number | null
}
const series: Series[] = []
await measureScenario(0)
const dynamicBaseline = meanAnchor(series.find(entry => entry.name.startsWith('dynamic-tagging-')))
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
const termination = failedDynamic
  ? { kind: 'measured-first-failure', candidateCount: failedDynamic.candidateCount }
  : { kind: 'succeeded-through-operator-cap', candidateCount: lastDynamic?.candidateCount ?? null }
await writeFile(
  outputPath,
  `${JSON.stringify({ configured: { trials, dynamicCounts, rates, assumptions }, termination, series })}\n`,
  { encoding: 'utf8', mode: 0o600 },
)
await chmod(outputPath, 0o600)

async function measureScenario(index: number): Promise<void> {
  const scenario = scenarios[index]
  if (!scenario) return
  const observations: Observation[] = []
  await measureTrial(
    scenario.request,
    scenario.currentCalls,
    scenario.repeatInstructions,
    0,
    observations,
  )
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
async function measureTrial(
  request: StructuredDecisionRequest,
  currentCalls: number,
  repeatInstructions: boolean,
  trial: number,
  observations: Observation[],
): Promise<void> {
  if (trial >= trials) return
  observations.push(await measure(request, currentCalls, repeatInstructions))
  await measureTrial(request, currentCalls, repeatInstructions, trial + 1, observations)
}
async function measure(
  request: StructuredDecisionRequest,
  currentCalls: number,
  repeatInstructions: boolean,
): Promise<Observation> {
  const startedAt = performance.now()
  try {
    const result = await client.decide(request)
    const anchor = result.answers[0]
    if (anchor?.type !== 'noul') throw new Error('Benchmark anchor was not Noul.')
    const inputTokens = usageTokens(result.usage, 'input_tokens', 'prompt_tokens')
    const outputTokens = usageTokens(result.usage, 'output_tokens', 'completion_tokens')
    return {
      success: true,
      durationMs: Math.round(performance.now() - startedAt),
      anchorProbability: anchor.probability,
      usage: result.usage,
      costUsd: {
        jev:
          inputTokens === null || outputTokens === null
            ? null
            : calculateTokenCostUsd(inputTokens, rates.jevInput) +
              calculateTokenCostUsd(outputTokens, rates.jevOutput),
        modeledCurrent: modeledCurrentCost(request, currentCalls, repeatInstructions),
      },
    }
  } catch (error) {
    return {
      success: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : 'Unknown benchmark failure.',
    }
  }
}
function modeledCurrentCost(
  request: StructuredDecisionRequest,
  calls: number,
  repeatInstructions: boolean,
): number {
  const stateTokens = estimateTokens(request.state) * calls
  const instructionTokens =
    request.questions.reduce((sum, question) => sum + estimateTokens(question.question), 0) *
    (repeatInstructions ? calls : 1)
  const contextGrowthTokens = repeatInstructions
    ? assumptions.contextGrowthTokensPerIteration * ((calls * (calls - 1)) / 2)
    : 0
  const cacheHit = assumptions.cacheHitRate
  return (
    calculateTokenCostUsd(
      stateTokens + contextGrowthTokens + instructionTokens * (1 - cacheHit),
      rates.currentUncachedInput,
    ) +
    calculateTokenCostUsd(instructionTokens * cacheHit, rates.currentCachedInput) +
    calculateTokenCostUsd(assumptions.outputTokensPerCall * calls, rates.currentOutput) +
    calculateTokenCostUsd(assumptions.reasoningTokensPerCall * calls, rates.currentReasoning)
  )
}
function dynamicRequest(count: number, subject: string): StructuredDecisionRequest {
  return {
    state,
    questions: Array.from({ length: count }, (_, index) => ({
      id: `candidate-${index}`,
      type: 'noul',
      question: `Decide whether this item matches ${subject} ${index}: ${'specific candidate context '.repeat(10)}`,
    })),
  }
}
function meanAnchor(entry?: Series): number | null {
  const values = entry?.observations.flatMap(observation =>
    typeof observation.anchorProbability === 'number' ? [observation.anchorProbability] : [],
  )
  return values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}
function usageTokens(
  usage: Readonly<Record<string, unknown>> | null,
  primary: string,
  fallback: string,
): number | null {
  const value = usage?.[primary] ?? usage?.[fallback]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}
