import { describe, expect, it } from 'vitest'
import { calculateTokenCostUsd } from './cost-model.mts'

describe('calculateTokenCostUsd', () => {
  it('rejects invalid observed usage', () => {
    expect(() => calculateTokenCostUsd(-1, 1)).toThrow('Tokens')
    expect(() => calculateTokenCostUsd(1, Number.NaN)).toThrow('rate')
  })

  it('calculates cost from an injected private rate', () => {
    expect(calculateTokenCostUsd(500_000, 2)).toBe(1)
  })
})
