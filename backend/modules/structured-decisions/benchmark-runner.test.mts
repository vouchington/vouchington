import { describe, expect, it, vi } from 'vitest'
import { loadBenchmarkConfig } from './benchmark-config.mts'
import { runBenchmark } from './benchmark-runner.mts'
import type {
  StructuredDecisionClient,
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from './types.mts'

const config = loadBenchmarkConfig({
  OPENROUTER_API_KEY: 'test-key',
  STRUCTURED_DECISIONS_BENCHMARK_OUTPUT: '/private/tmp/report.json',
  STRUCTURED_DECISIONS_BENCHMARK_TRIALS: '2',
  STRUCTURED_DECISIONS_BENCHMARK_DYNAMIC_COUNTS: '2,3',
  STRUCTURED_DECISIONS_JEV_INPUT_PER_MILLION_USD: '1',
  STRUCTURED_DECISIONS_JEV_OUTPUT_PER_MILLION_USD: '2',
  STRUCTURED_DECISIONS_CURRENT_INPUT_PER_MILLION_USD: '3',
  STRUCTURED_DECISIONS_CURRENT_CACHED_INPUT_PER_MILLION_USD: '1',
  STRUCTURED_DECISIONS_CURRENT_OUTPUT_PER_MILLION_USD: '4',
  STRUCTURED_DECISIONS_CURRENT_REASONING_PER_MILLION_USD: '5',
  STRUCTURED_DECISIONS_CURRENT_CACHE_HIT_RATE: '0.5',
  STRUCTURED_DECISIONS_CURRENT_OUTPUT_TOKENS_PER_CALL: '10',
  STRUCTURED_DECISIONS_CURRENT_REASONING_TOKENS_PER_CALL: '20',
  STRUCTURED_DECISIONS_CURRENT_CONTEXT_GROWTH_TOKENS_PER_ITERATION: '30',
})

function result(
  request: StructuredDecisionRequest,
  probability: number,
  usage: Readonly<Record<string, unknown>> | null,
): StructuredDecisionResult {
  return {
    answers: request.questions.map(question => ({
      id: question.id,
      type: 'noul' as const,
      probability,
    })),
    model: 'typesafe/jev-1.13-test',
    provider: 'TypeSafe',
    raw: {},
    usage,
  }
}

describe('runBenchmark', () => {
  it('measures fixed and dynamic candidate sets through the operator cap', async () => {
    let call = 0
    const decide = vi.fn<StructuredDecisionClient['decide']>().mockImplementation(async request => {
      call += 1
      return result(
        request,
        call % 2 === 0 ? 0.6 : 0.5,
        call % 2 === 0
          ? { prompt_tokens: 100, completion_tokens: 2 }
          : { input_tokens: 100, output_tokens: 2 },
      )
    })
    let tick = 0
    const report = await runBenchmark(config, { decide }, () => (tick += 10))

    expect(report.termination).toEqual({
      kind: 'succeeded-through-operator-cap',
      candidateCount: 3,
    })
    expect(report.series.map(entry => [entry.name, entry.candidateCount])).toEqual([
      ['moderation-fixed-six', 6],
      ['community-custom-ten', 10],
      ['dynamic-tagging-2', 2],
      ['dynamic-tagging-3', 3],
    ])
    expect(report.series[0]?.anchorDriftWithinTrials).toBeCloseTo(0.1)
    expect(report.series[2]?.anchorDriftFromSmallestDynamic).toBe(0)
    expect(report.series[3]?.anchorDriftFromSmallestDynamic).toBe(0)
    expect(report.series[0]?.observations[0]).toMatchObject({
      success: true,
      durationMs: 10,
    })
    expect(report.series[0]?.observations[0]?.costUsd?.jev).toBeCloseTo(0.000104)
    expect(decide).toHaveBeenCalledTimes(8)
  })

  it('records the first dynamic failure and stops later dynamic work', async () => {
    const decide = vi.fn<StructuredDecisionClient['decide']>().mockImplementation(async request => {
      if (request.questions.length === 2) throw new Error('provider limit')
      return result(request, 0.5, null)
    })
    const report = await runBenchmark({ ...config, trials: 1 }, { decide })

    expect(report.termination).toEqual({ kind: 'measured-first-failure', candidateCount: 2 })
    expect(report.series.at(-1)?.observations).toEqual([
      expect.objectContaining({ success: false, error: 'provider limit' }),
    ])
    expect(report.series.some(entry => entry.name === 'dynamic-tagging-3')).toBe(false)
  })

  it('fails an invalid anchor and reports missing token usage without inventing cost', async () => {
    const invalidAnchor: StructuredDecisionClient = {
      decide: async request => ({
        ...result(request, 0.5, null),
        answers: [
          {
            id: request.questions[0]!.id,
            type: 'choice',
            choice: 'yes',
            confidence: 1,
            probabilities: { yes: 1 },
          },
        ],
      }),
    }
    const failed = await runBenchmark({ ...config, trials: 1, dynamicCounts: [1] }, invalidAnchor)
    expect(failed.series[0]?.observations[0]).toMatchObject({
      success: false,
      error: 'Benchmark anchor was not Noul.',
    })

    const noUsage: StructuredDecisionClient = {
      decide: async request => result(request, 0.5, { input_tokens: 'unknown' }),
    }
    const measured = await runBenchmark({ ...config, trials: 1, dynamicCounts: [] }, noUsage)
    expect(measured.termination).toEqual({
      kind: 'succeeded-through-operator-cap',
      candidateCount: null,
    })
    expect(measured.series[0]?.observations[0]?.costUsd?.jev).toBeNull()
  })
})
