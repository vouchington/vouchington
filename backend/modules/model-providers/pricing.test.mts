import { describe, expect, it } from 'vitest'
import { calcCostMicrounits } from '@voucha/test-helpers/agents/calc-cost-microunits'
import { getPricedModels, isPricedModel } from './pricing.mts'
import type { ModelUsage } from '@vouchington/ai/providers'

function usage(overrides: Partial<ModelUsage>): ModelUsage {
  return {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    ...overrides,
  }
}

describe('Haiku 5.5 pricing', () => {
  it('prices a prompt of at most 100k tokens at the base rates', () => {
    // 1M uncached input at $0.10 + 1M output at $0.50, with the prompt at exactly the 100k limit.
    expect(
      calcCostMicrounits(
        'anthropic',
        'claude-haiku-5-5',
        'standard',
        usage({ inputTokens: 100_000, outputTokens: 1_000_000 }),
      ),
    ).toBe(10_000 + 500_000)
  })

  it('prices every dimension, output included, at the higher rates above 100k tokens', () => {
    // 100,001 prompt tokens: the band is chosen by the whole prompt, so the uncached input
    // (100,000 - 10,000) and the cache read both pay the over-100k rates, and so does the output.
    const cost = calcCostMicrounits(
      'anthropic',
      'claude-haiku-5-5',
      'standard',
      usage({ inputTokens: 100_001, cacheReadTokens: 10_000, outputTokens: 200_000 }),
    )
    // 90,001 * $0.50 + 10,000 * $0.05 + 200,000 * $2.50 per million.
    expect(cost).toBe(45_001 + 500 + 500_000)
  })

  it('counts cache writes and reads toward the prompt size that picks the band', () => {
    const cost = calcCostMicrounits(
      'anthropic',
      'claude-haiku-5-5',
      'standard',
      usage({
        inputTokens: 100_000,
        cacheReadTokens: 60_000,
        cacheWrite5mTokens: 30_000,
        cacheWrite1hTokens: 10_000,
      }),
    )
    // Exactly 100k: base rates. 60k * $0.01 + 30k * $0.125 + 10k * $0.20 per million.
    expect(cost).toBe(600 + 3_750 + 2_000)
  })

  it('leaves other Anthropic service tiers unpriced', () => {
    expect(
      calcCostMicrounits('anthropic', 'claude-haiku-5-5', 'priority', usage({ inputTokens: 1 })),
    ).toBeNull()
  })
})

describe('GPT-6 Luna pricing', () => {
  it('prices the standard and flex tiers, with flex at half price', () => {
    const call = usage({ inputTokens: 200_000, cacheReadTokens: 100_000, outputTokens: 200_000 })
    // 100k uncached * $0.10 + 100k read * $0.01 + 200k output * $0.50 per million.
    expect(calcCostMicrounits('openai', 'gpt-6-luna', 'default', call)).toBe(
      10_000 + 1_000 + 100_000,
    )
    expect(calcCostMicrounits('openai', 'gpt-6-luna', 'flex', call)).toBe(5_000 + 500 + 50_000)
  })

  it('prices a prompt over 272k tokens at the long-context rates', () => {
    expect(
      calcCostMicrounits(
        'openai',
        'gpt-6-luna',
        'default',
        usage({ inputTokens: 272_001, outputTokens: 1_000_000 }),
      ),
    ).toBe(54_400 + 750_000)
  })

  it('prices cache writes only where the provider publishes a rate', () => {
    const write = usage({ inputTokens: 200_000, cacheWrite5mTokens: 200_000 })
    expect(calcCostMicrounits('openai', 'gpt-6-luna', 'default', write)).toBe(25_000)
    expect(
      calcCostMicrounits(
        'openai',
        'gpt-6-luna',
        'default',
        usage({ inputTokens: 10, cacheWrite1hTokens: 10 }),
      ),
    ).toBeNull()
  })
})

describe('calcCostMicrounits', () => {
  it('normalizes a dated snapshot and a routed name before the lookup', () => {
    const call = usage({ inputTokens: 1000, outputTokens: 500 })
    // 1000 * $0.05 + 500 * $0.25 per million = 175 microunits.
    const expected = calcCostMicrounits('openai', 'gpt-6-luna', 'flex', call)
    expect(expected).toBe(175)
    expect(calcCostMicrounits('openai', 'gpt-6-luna-2026-10-01', 'flex', call)).toBe(expected)
    expect(calcCostMicrounits('openai', 'openai/gpt-6-luna-20261001', 'flex', call)).toBe(expected)
  })

  it('returns null for an unknown model, an unknown tier and a classifier provider', () => {
    const call = usage({ inputTokens: 10, outputTokens: 5 })
    expect(calcCostMicrounits('openai', 'unknown-model', 'default', call)).toBeNull()
    expect(calcCostMicrounits('openai', 'gpt-6-luna', 'priority', call)).toBeNull()
    expect(calcCostMicrounits('typesafe', 'typesafe/jev-1.13', 'default', call)).toBeNull()
  })
})

describe('priced model lookup', () => {
  it('lists the models that can be selected per provider', () => {
    expect(getPricedModels('anthropic')).toEqual(['claude-haiku-5-5'])
    expect(isPricedModel('openai', 'gpt-6-luna')).toBe(true)
    expect(isPricedModel('anthropic', 'gpt-6-luna')).toBe(false)
    expect(isPricedModel('openai', 'constructor')).toBe(false)
  })
})
