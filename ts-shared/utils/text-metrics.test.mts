import { describe, expect, it } from 'vitest'
import { countWords, countSentences } from './text-metrics.mts'

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(countWords('   ')).toBe(0)
  })

  it('returns 1 for a single word', () => {
    expect(countWords('hello')).toBe(1)
  })

  it('counts multiple words separated by single spaces', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('handles leading and trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2)
  })

  it('handles multiple spaces between words', () => {
    expect(countWords('one   two    three')).toBe(3)
  })

  it('counts words with markdown punctuation', () => {
    expect(countWords('**bold** and _italic_ text')).toBe(4)
  })

  it('counts markdown links as single words (no spaces)', () => {
    expect(countWords('[link](https://example.com) is here')).toBe(3)
  })

  it('counts words in multi-line text', () => {
    expect(countWords('line one\nline two\nline three')).toBe(6)
  })
})

describe('countSentences', () => {
  it('returns 0 for empty string', () => {
    expect(countSentences('')).toBe(0)
  })

  it('returns 0 for whitespace-only string', () => {
    expect(countSentences('   ')).toBe(0)
  })

  it('returns 1 for text with no sentence terminator', () => {
    expect(countSentences('no sentence ending here')).toBe(1)
  })

  it('counts period-terminated sentences', () => {
    expect(countSentences('First sentence. Second sentence. Third sentence.')).toBe(3)
  })

  it('counts exclamation-terminated sentences', () => {
    expect(countSentences('Great product! Really love it! Highly recommend!')).toBe(3)
  })

  it('counts question-terminated sentences', () => {
    expect(countSentences('Is this good? Yes it is. Would I recommend it?')).toBe(3)
  })

  it('handles mixed terminators', () => {
    expect(countSentences('Really? Yes! Confirmed.')).toBe(3)
  })

  it('handles multiple consecutive terminators as one split', () => {
    expect(countSentences('Wait... Really?! OK then.')).toBe(3)
  })

  it('handles newlines between sentences', () => {
    expect(countSentences('First.\nSecond.\nThird.')).toBe(3)
  })

  it('returns 1 for text ending without terminator', () => {
    expect(countSentences('Just one long run-on thought without any ending')).toBe(1)
  })

  it('handles markdown with multiple sentences', () => {
    expect(
      countSentences('This product is **amazing**. I use it every day. Highly recommended.'),
    ).toBe(3)
  })

  it('counts sentences ending in closing double-quote', () => {
    expect(countSentences('He said "great product." She agreed. It was true.')).toBe(3)
  })

  it('counts sentences ending in closing single-quote', () => {
    expect(countSentences("He said 'great product.' She agreed. It was true.")).toBe(3)
  })

  it('counts sentences ending in closing parenthesis', () => {
    expect(countSentences('Good product (really good.) Great value. Would recommend.')).toBe(3)
  })

  it('does not split on decimal points in numbers', () => {
    expect(countSentences('The price is $5.99 which is great. I recommend it.')).toBe(2)
  })
})
