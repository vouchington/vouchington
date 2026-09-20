export function loadBenchmarkConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    apiKey: required(env, 'OPENROUTER_API_KEY'),
    outputPath: required(env, 'STRUCTURED_DECISIONS_BENCHMARK_OUTPUT'),
    trials: positiveInteger(env, 'STRUCTURED_DECISIONS_BENCHMARK_TRIALS', 2),
    dynamicCounts: positiveIntegers(
      env,
      'STRUCTURED_DECISIONS_BENCHMARK_DYNAMIC_COUNTS',
      '25,100,300,600',
    ),
    rates: {
      jevInput: nonNegative(env, 'STRUCTURED_DECISIONS_JEV_INPUT_PER_MILLION_USD'),
      jevOutput: nonNegative(env, 'STRUCTURED_DECISIONS_JEV_OUTPUT_PER_MILLION_USD'),
      currentUncachedInput: nonNegative(env, 'STRUCTURED_DECISIONS_CURRENT_INPUT_PER_MILLION_USD'),
      currentCachedInput: nonNegative(
        env,
        'STRUCTURED_DECISIONS_CURRENT_CACHED_INPUT_PER_MILLION_USD',
      ),
      currentOutput: nonNegative(env, 'STRUCTURED_DECISIONS_CURRENT_OUTPUT_PER_MILLION_USD'),
      currentReasoning: nonNegative(env, 'STRUCTURED_DECISIONS_CURRENT_REASONING_PER_MILLION_USD'),
    },
    assumptions: {
      cacheHitRate: fraction(env, 'STRUCTURED_DECISIONS_CURRENT_CACHE_HIT_RATE'),
      outputTokensPerCall: nonNegative(env, 'STRUCTURED_DECISIONS_CURRENT_OUTPUT_TOKENS_PER_CALL'),
      reasoningTokensPerCall: nonNegative(
        env,
        'STRUCTURED_DECISIONS_CURRENT_REASONING_TOKENS_PER_CALL',
      ),
      contextGrowthTokensPerIteration: nonNegative(
        env,
        'STRUCTURED_DECISIONS_CURRENT_CONTEXT_GROWTH_TOKENS_PER_ITERATION',
      ),
    },
  }
}
export type BenchmarkConfig = ReturnType<typeof loadBenchmarkConfig>

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}
function nonNegative(env: NodeJS.ProcessEnv, name: string): number {
  const value = Number(required(env, name))
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative.`)
  return value
}
function fraction(env: NodeJS.ProcessEnv, name: string): number {
  const value = nonNegative(env, name)
  if (value > 1) throw new Error(`${name} must be between zero and one.`)
  return value
}
function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = Number(env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be positive.`)
  return value
}
function positiveIntegers(env: NodeJS.ProcessEnv, name: string, fallback: string): number[] {
  const values = (env[name] ?? fallback).split(',').map(value => Number(value.trim()))
  if (
    values.length === 0 ||
    values.some(value => !Number.isInteger(value) || value < 1) ||
    values.some((value, index) => index > 0 && value <= values[index - 1]!)
  )
    throw new Error(`${name} must be strictly increasing positive integers.`)
  return values
}
