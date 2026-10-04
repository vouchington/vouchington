import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  clampAnonLimit,
  clampLimit,
  getPaginationLimits,
  getPaginationLimitsForContract,
} from './index.mts'
import { paginationConfig } from './config.mts'

describe('runtime pagination profiles', () => {
  it('clamps a default above the lowered common maximum', () => {
    overrideDynamicConfigFieldsForTest(paginationConfig, { default_limit: 25, max_limit: 7 })
    expect(getPaginationLimits()).toEqual({ default: 7, max: 7 })
    expect(clampLimit()).toBe(7)
    expect(clampLimit(100)).toBe(7)
  })
  it('keeps exception maxima independent while clamping their defaults', () => {
    overrideDynamicConfigFieldsForTest(paginationConfig, {
      max_limit: 3,
      small_max_limit: 6,
      trending_max_limit: 8,
      descendants_max_limit: 12,
      anonymous_max_limit: 2,
    })
    expect(getPaginationLimits(10, 25)).toEqual({ default: 6, max: 6 })
    expect(getPaginationLimits(10, 50)).toEqual({ default: 8, max: 8 })
    expect(clampLimit(50, 10, 50)).toBe(8)
    expect(getPaginationLimits(100, 200)).toEqual({ default: 12, max: 12 })
    expect(clampAnonLimit(100)).toBe(2)
  })
  it('falls back invalid above-ceiling configuration and never widens a static route range', () => {
    overrideDynamicConfigFieldsForTest(paginationConfig, { max_limit: 1000, small_max_limit: 1000 })
    expect(getPaginationLimits()).toEqual({ default: 25, max: 100 })
    expect(getPaginationLimits(10, 25)).toEqual({ default: 10, max: 25 })
    expect(getPaginationLimits(25, 15).max).toBe(15)
    expect(() => getPaginationLimitsForContract({})).toThrow('integer limit')
  })
})
