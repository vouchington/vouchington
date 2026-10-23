import { describe, expect, it } from 'vitest'
import { getCloudflareBotScore } from './cloudflare-bot-score.mts'

describe('Cloudflare bot score', () => {
  it.each([
    [undefined, undefined],
    [0, undefined],
    [1, 1],
    [29, 29],
    [30, 30],
    [99, 99],
    [100, undefined],
    [1.5, undefined],
    ['1', undefined],
  ])('normalizes %s to %s', (score, expected) => {
    const request = new Request('https://voucha.ai/api/v1/posts')
    Object.defineProperty(request, 'cf', { value: { botManagement: { score } } })

    expect(getCloudflareBotScore(request)).toBe(expected)
  })

  it('gracefully omits absent Bot Management metadata', () => {
    expect(getCloudflareBotScore(new Request('https://voucha.ai/api/v1/posts'))).toBeUndefined()
  })
})
