import { describe, it, expect } from 'vitest'
import { isValidTheme, isValidListStyle, isValidFeedStyle } from '../shared'

describe('isValidTheme', () => {
  it('returns true for valid themes', () => {
    expect(isValidTheme('light')).toBe(true)
    expect(isValidTheme('dark')).toBe(true)
    expect(isValidTheme('system')).toBe(true)
  })

  it('returns false for invalid themes', () => {
    expect(isValidTheme('')).toBe(false)
    expect(isValidTheme('auto')).toBe(false)
    expect(isValidTheme('DARK')).toBe(false)
    expect(isValidTheme('Light')).toBe(false)
  })
})

describe('isValidListStyle', () => {
  it('returns true for valid list styles', () => {
    expect(isValidListStyle('card')).toBe(true)
    expect(isValidListStyle('compact')).toBe(true)
  })

  it('returns false for invalid list styles', () => {
    expect(isValidListStyle('')).toBe(false)
    expect(isValidListStyle('list')).toBe(false)
    expect(isValidListStyle('CARD')).toBe(false)
    expect(isValidListStyle('grid')).toBe(false)
  })
})

describe('isValidFeedStyle', () => {
  it('returns true for valid feed styles', () => {
    expect(isValidFeedStyle('compact')).toBe(true)
    expect(isValidFeedStyle('summary')).toBe(true)
  })

  it('returns false for invalid feed styles', () => {
    expect(isValidFeedStyle('')).toBe(false)
    expect(isValidFeedStyle('card')).toBe(false)
    expect(isValidFeedStyle('SUMMARY')).toBe(false)
    expect(isValidFeedStyle('full')).toBe(false)
  })
})
