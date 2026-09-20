import { describe, expect, it } from 'vitest'
import { loadBenchmarkConfig } from './benchmark-config.mts'

const validEnv = {
  OPENROUTER_API_KEY: 'test-key',
  STRUCTURED_DECISIONS_BENCHMARK_OUTPUT: '/private/tmp/report.json',
  STRUCTURED_DECISIONS_JEV_INPUT_PER_MILLION_USD: '1',
  STRUCTURED_DECISIONS_JEV_OUTPUT_PER_MILLION_USD: '0',
  STRUCTURED_DECISIONS_CURRENT_INPUT_PER_MILLION_USD: '2',
  STRUCTURED_DECISIONS_CURRENT_CACHED_INPUT_PER_MILLION_USD: '0.5',
  STRUCTURED_DECISIONS_CURRENT_OUTPUT_PER_MILLION_USD: '3',
  STRUCTURED_DECISIONS_CURRENT_REASONING_PER_MILLION_USD: '4',
  STRUCTURED_DECISIONS_CURRENT_CACHE_HIT_RATE: '0.5',
  STRUCTURED_DECISIONS_CURRENT_OUTPUT_TOKENS_PER_CALL: '10',
  STRUCTURED_DECISIONS_CURRENT_REASONING_TOKENS_PER_CALL: '20',
  STRUCTURED_DECISIONS_CURRENT_CONTEXT_GROWTH_TOKENS_PER_ITERATION: '30',
} satisfies NodeJS.ProcessEnv

describe('loadBenchmarkConfig', () => {
  it('loads private inputs and applies bounded defaults', () => {
    expect(loadBenchmarkConfig(validEnv)).toMatchObject({
      apiKey: 'test-key',
      outputPath: '/private/tmp/report.json',
      trials: 2,
      dynamicCounts: [25, 100, 300, 600],
      rates: { jevInput: 1, jevOutput: 0 },
      assumptions: { cacheHitRate: 0.5 },
    })
  })

  it.each([
    ['missing required value', { OPENROUTER_API_KEY: '' }, 'OPENROUTER_API_KEY is required'],
    [
      'negative rate',
      { STRUCTURED_DECISIONS_JEV_INPUT_PER_MILLION_USD: '-1' },
      'must be non-negative',
    ],
    [
      'invalid cache fraction',
      { STRUCTURED_DECISIONS_CURRENT_CACHE_HIT_RATE: '1.1' },
      'must be between zero and one',
    ],
    ['invalid trial count', { STRUCTURED_DECISIONS_BENCHMARK_TRIALS: '0' }, 'must be positive'],
    [
      'non-increasing counts',
      { STRUCTURED_DECISIONS_BENCHMARK_DYNAMIC_COUNTS: '10,10' },
      'must be strictly increasing',
    ],
    [
      'invalid count',
      { STRUCTURED_DECISIONS_BENCHMARK_DYNAMIC_COUNTS: '10,nope' },
      'must be strictly increasing',
    ],
  ])('rejects %s', (_name, override, message) => {
    expect(() => loadBenchmarkConfig({ ...validEnv, ...override })).toThrow(message)
  })
})
