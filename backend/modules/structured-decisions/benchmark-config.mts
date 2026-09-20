export function loadBenchmarkConfig() {
  return {
    apiKey: required('OPENROUTER_API_KEY'),
    outputPath: required('STRUCTURED_DECISIONS_BENCHMARK_OUTPUT'),
    trials: positiveInteger('STRUCTURED_DECISIONS_BENCHMARK_TRIALS', 2),
    dynamicCounts: positiveIntegers(
      'STRUCTURED_DECISIONS_BENCHMARK_DYNAMIC_COUNTS',
      '25,100,300,600',
    ),
    rates: {
      jevInput: nonNegative('STRUCTURED_DECISIONS_JEV_INPUT_PER_MILLION_USD'),
      jevOutput: nonNegative('STRUCTURED_DECISIONS_JEV_OUTPUT_PER_MILLION_USD'),
      currentUncachedInput: nonNegative('STRUCTURED_DECISIONS_CURRENT_INPUT_PER_MILLION_USD'),
      currentCachedInput: nonNegative('STRUCTURED_DECISIONS_CURRENT_CACHED_INPUT_PER_MILLION_USD'),
      currentOutput: nonNegative('STRUCTURED_DECISIONS_CURRENT_OUTPUT_PER_MILLION_USD'),
      currentReasoning: nonNegative('STRUCTURED_DECISIONS_CURRENT_REASONING_PER_MILLION_USD'),
    },
    assumptions: {
      cacheHitRate: fraction('STRUCTURED_DECISIONS_CURRENT_CACHE_HIT_RATE'),
      outputTokensPerCall: nonNegative('STRUCTURED_DECISIONS_CURRENT_OUTPUT_TOKENS_PER_CALL'),
      reasoningTokensPerCall: nonNegative('STRUCTURED_DECISIONS_CURRENT_REASONING_TOKENS_PER_CALL'),
      contextGrowthTokensPerIteration: nonNegative(
        'STRUCTURED_DECISIONS_CURRENT_CONTEXT_GROWTH_TOKENS_PER_ITERATION',
      ),
    },
  }
}
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}
function nonNegative(name: string): number {
  const value = Number(required(name))
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative.`)
  return value
}
function fraction(name: string): number {
  const value = nonNegative(name)
  if (value > 1) throw new Error(`${name} must be between zero and one.`)
  return value
}
function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be positive.`)
  return value
}
function positiveIntegers(name: string, fallback: string): number[] {
  const values = (process.env[name] ?? fallback).split(',').map(value => Number(value.trim()))
  if (
    values.length === 0 ||
    values.some(value => !Number.isInteger(value) || value < 1) ||
    values.some((value, index) => index > 0 && value <= values[index - 1]!)
  )
    throw new Error(`${name} must be strictly increasing positive integers.`)
  return values
}
