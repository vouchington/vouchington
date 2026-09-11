import { describe, it, expect } from 'vitest'
import { normalizeKey, toTitleCase } from './strings.mts'

describe('toTitleCase', () => {
  it('capitalizes first and last words', () => {
    expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox')
    expect(toTitleCase('a tale of two cities')).toBe('A Tale of Two Cities')
  })

  it('keeps articles lowercase in middle', () => {
    expect(toTitleCase('the new york times')).toBe('The New York Times')
    expect(toTitleCase('a day in the life')).toBe('A Day in the Life')
  })

  it('keeps prepositions lowercase in middle', () => {
    expect(toTitleCase('beauty and the beast')).toBe('Beauty and the Beast')
    expect(toTitleCase('gone with the wind')).toBe('Gone with the Wind')
    expect(toTitleCase('lord of the rings')).toBe('Lord of the Rings')
  })

  it('preserves acronyms', () => {
    expect(toTitleCase('NASA guidelines')).toBe('NASA Guidelines')
    expect(toTitleCase('the FBI report')).toBe('The FBI Report')
    expect(toTitleCase('AI and ML trends')).toBe('AI and ML Trends')
  })

  it('capitalizes long words regardless of position', () => {
    expect(toTitleCase('artificial intelligence')).toBe('Artificial Intelligence')
    expect(toTitleCase('typescript programming')).toBe('Typescript Programming')
  })

  it('handles single words', () => {
    expect(toTitleCase('hello')).toBe('Hello')
    expect(toTitleCase('NASA')).toBe('NASA')
  })

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('')
  })

  it('normalizes whitespace', () => {
    expect(toTitleCase('the  quick   brown    fox')).toBe('The Quick Brown Fox')
  })

  it('capitalizes last word even if it is an article', () => {
    expect(toTitleCase('who are the')).toBe('Who Are The')
    expect(toTitleCase('what is a')).toBe('What is A')
  })

  it('handles conjunctions correctly', () => {
    expect(toTitleCase('fast and furious')).toBe('Fast and Furious')
    expect(toTitleCase('sink or swim')).toBe('Sink or Swim')
    expect(toTitleCase('now or never')).toBe('Now or Never')
  })

  it('handles mixed case input with acronyms', () => {
    // THE and FOX are preserved as acronyms (≤4 chars, all uppercase)
    expect(toTitleCase('THE QUICK BROWN FOX')).toBe('THE Quick Brown FOX')
    expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox')
  })
})

describe('normalizeKey', () => {
  it('trims whitespace and lowercases keys', () => {
    expect(normalizeKey('  MyKey  ')).toBe('mykey')
  })
})
