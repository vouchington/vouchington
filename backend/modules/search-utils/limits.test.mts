import { describe, it, expect } from 'vitest'
import {
  MIN_LIMIT,
  MAX_LIMIT,
  DEFAULT_LIMIT,
  ANON_MAX_LIMIT,
  TRENDING_TOPICS_DEFAULT_LIMIT,
  clampAnonLimit,
  clampLimit,
  clampMaxDepth,
} from './limits.mts'

describe('search limit constants', () => {
  it('exports expected limit bounds and defaults', () => {
    expect(MIN_LIMIT).toBe(1)
    expect(MAX_LIMIT).toBe(100)
    expect(DEFAULT_LIMIT).toBe(25)
    expect(ANON_MAX_LIMIT).toBe(25)
    expect(TRENDING_TOPICS_DEFAULT_LIMIT).toBe(20)
  })
})

describe('clampAnonLimit', () => {
  it('clamps values above 25', () => {
    expect(clampAnonLimit(26)).toBe(25)
    expect(clampAnonLimit(100)).toBe(25)
    expect(clampAnonLimit(50)).toBe(25)
  })

  it('passes through values at or below 25', () => {
    expect(clampAnonLimit(25)).toBe(25)
    expect(clampAnonLimit(10)).toBe(10)
    expect(clampAnonLimit(1)).toBe(1)
  })
})

describe('clampLimit', () => {
  it('uses default 25 when called with no args', () => {
    expect(clampLimit()).toBe(25)
  })

  it('uses custom default when limit is undefined', () => {
    expect(clampLimit(undefined, 20)).toBe(20)
  })

  it('uses custom default when limit is NaN', () => {
    expect(clampLimit(Number.NaN, 20)).toBe(20)
  })

  it('clamps to minimum 1', () => {
    expect(clampLimit(0)).toBe(1)
    expect(clampLimit(-5)).toBe(1)
    expect(clampLimit(0, 20)).toBe(1)
  })

  it('clamps to maximum 100', () => {
    expect(clampLimit(101)).toBe(100)
    expect(clampLimit(500, 20)).toBe(100)
  })

  it('allows values within range', () => {
    expect(clampLimit(1)).toBe(1)
    expect(clampLimit(25)).toBe(25)
    expect(clampLimit(50, 20)).toBe(50)
    expect(clampLimit(100)).toBe(100)
  })
})

describe('clampMaxDepth', () => {
  it('returns default when undefined', () => {
    expect(clampMaxDepth()).toBe(6)
  })

  it('clamps to allowed range', () => {
    expect(clampMaxDepth(0)).toBe(1)
    expect(clampMaxDepth(30)).toBe(25)
    expect(clampMaxDepth(10)).toBe(10)
  })
})
