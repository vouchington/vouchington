import { describe, expect, it } from 'vitest'
import { calcCostMicrounits } from './pricing.mts'

describe('calcCostMicrounits', () => {
  it('computes cost for gpt-5.4-nano at flex tier', () => {
    const cost = calcCostMicrounits('gpt-5.4-nano', 'flex', {
      input_tokens: 1000,
      output_tokens: 500,
    })
    // 1000 * 100_000 + 500 * 625_000 = 412_500_000 microunits-tokens; /1e6 rounds 412.5 -> 413.
    expect(cost).toBe(413)
  })

  it('computes cost for gpt-5.4-nano at default tier', () => {
    const cost = calcCostMicrounits('gpt-5.4-nano', 'default', {
      input_tokens: 1000,
      output_tokens: 500,
    })
    // 1000 * 200_000 + 500 * 1_250_000 = 825_000_000 microunits-tokens; /1e6 = 825 exactly.
    expect(cost).toBe(825)
  })

  it('returns null for an unknown model/service-tier combination', () => {
    const cost = calcCostMicrounits('unknown-model', 'default', {
      input_tokens: 1000,
      output_tokens: 500,
    })
    expect(cost).toBeNull()
  })

  it('returns null for gpt-5.4-nano:priority — the model has no Priority-tier pricing', () => {
    // Real unsupported pair: OpenAI's pricing page has no Priority row for gpt-5.4-nano at all.
    const cost = calcCostMicrounits('gpt-5.4-nano', 'priority', {
      input_tokens: 1000,
      output_tokens: 500,
    })
    expect(cost).toBeNull()
  })

  it('prices cached input tokens at 10% of the uncached rate, not 50%', () => {
    // Regression guard: the old implementation hardcoded a 0.5x cached discount via doubled
    // BigInt arithmetic. gpt-5.4-nano's real cached rate is 0.1x (20_000 vs 200_000 per 1M at
    // default tier). If the 0.5x bug reappears this evaluates to 30, not 22.
    const cost = calcCostMicrounits('gpt-5.4-nano', 'default', {
      input_tokens: 200,
      output_tokens: 0,
      input_tokens_details: { cached_tokens: 100 },
    })
    // 100 uncached * 200_000 + 100 cached * 20_000 = 22_000_000; /1e6 = 22 exactly.
    expect(cost).toBe(22)
  })

  it('clamps cached_tokens to input_tokens when cached_tokens exceeds input_tokens', () => {
    // Defensive: a response reporting more cached tokens than total input tokens should not
    // produce a negative uncached count or double-count tokens.
    const cost = calcCostMicrounits('gpt-5.4-nano', 'flex', {
      input_tokens: 50,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 200 },
    })
    // cachedTokens clamped to min(50, 200) = 50; uncachedInputTokens = max(0, 50 - 50) = 0.
    // 0 * 100_000 + 50 * 10_000 + 100 * 625_000 = 63_000_000; /1e6 = 63 exactly.
    expect(cost).toBe(63)
  })

  it('rounds half up exactly once per request', () => {
    // 4 output tokens * 625_000 = 2_500_000 -> 2.5 exactly, which must round up to 3, not down.
    expect(
      calcCostMicrounits('gpt-5.4-nano', 'flex', {
        input_tokens: 0,
        output_tokens: 4,
      }),
    ).toBe(3)
  })

  it('normalizes a dated model snapshot before the pricing lookup', () => {
    // response.model comes back as `<alias>-YYYY-MM-DD`, not the bare alias — a lookup keyed on
    // the raw snapshot would silently price 100% of rows as unpriced. Same inputs as the
    // "computes cost for gpt-5.4-nano at flex tier" case above; same expected cost.
    const cost = calcCostMicrounits('gpt-5.4-nano-2026-03-17', 'flex', {
      input_tokens: 1000,
      output_tokens: 500,
    })
    expect(cost).toBe(413)
  })

  it('rejects costs that cannot be represented as JSON-safe integers', () => {
    expect(() =>
      calcCostMicrounits('gpt-5.4-nano', 'default', {
        input_tokens: Number.MAX_SAFE_INTEGER,
        output_tokens: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow('AI usage cost exceeds the maximum JSON-safe integer')
  })
})
