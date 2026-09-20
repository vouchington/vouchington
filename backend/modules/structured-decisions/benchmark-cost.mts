import type { BenchmarkConfig } from './benchmark-config.mts'
import { calculateTokenCostUsd } from './cost-model.mts'
import type { StructuredDecisionRequest, StructuredDecisionResult } from './types.mts'

export function observedJevCost(
  config: BenchmarkConfig,
  result: StructuredDecisionResult,
): number | null {
  const inputTokens = usageTokens(result, 'input_tokens', 'prompt_tokens')
  const outputTokens = usageTokens(result, 'output_tokens', 'completion_tokens')
  return inputTokens === null || outputTokens === null
    ? null
    : calculateTokenCostUsd(inputTokens, config.rates.jevInput) +
        calculateTokenCostUsd(outputTokens, config.rates.jevOutput)
}

export function modeledCurrentCost(
  config: BenchmarkConfig,
  request: StructuredDecisionRequest,
  calls: number,
  repeatInstructions: boolean,
): number {
  const stateTokens = estimateTokens(request.state) * calls
  const instructionTokens =
    request.questions.reduce((sum, question) => sum + estimateTokens(question.question), 0) *
    (repeatInstructions ? calls : 1)
  const contextGrowthTokens = repeatInstructions
    ? config.assumptions.contextGrowthTokensPerIteration * ((calls * (calls - 1)) / 2)
    : 0
  const cacheHit = config.assumptions.cacheHitRate
  return (
    calculateTokenCostUsd(
      stateTokens + contextGrowthTokens + instructionTokens * (1 - cacheHit),
      config.rates.currentUncachedInput,
    ) +
    calculateTokenCostUsd(instructionTokens * cacheHit, config.rates.currentCachedInput) +
    calculateTokenCostUsd(
      config.assumptions.outputTokensPerCall * calls,
      config.rates.currentOutput,
    ) +
    calculateTokenCostUsd(
      config.assumptions.reasoningTokensPerCall * calls,
      config.rates.currentReasoning,
    )
  )
}

function usageTokens(
  result: StructuredDecisionResult,
  primary: string,
  fallback: string,
): number | null {
  const value = result.usage?.[primary] ?? result.usage?.[fallback]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4)
}
