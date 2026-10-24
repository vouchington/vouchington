import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { markAuthenticatedOriginRequest } from './authenticated-origin.mts'
import { getTrustedCloudflareBotScore } from './cloudflare-bot-score.mts'

describe('trusted Cloudflare bot score', () => {
  it('rejects a private header that did not pass the Worker-secret boundary', () => {
    expect(getTrustedCloudflareBotScore(requestWithScore('7'))).toBeUndefined()
  })

  it.each([
    ['1', 1],
    ['29', 29],
    ['30', 30],
    ['99', 99],
    ['0', undefined],
    ['100', undefined],
    ['1.5', undefined],
    ['07', undefined],
  ])('normalizes trusted score %s to %s', (raw, expected) => {
    const request = requestWithScore(raw)
    markAuthenticatedOriginRequest(request)

    expect(getTrustedCloudflareBotScore(request)).toBe(expected)
  })

  it('rejects ambiguous repeated headers', () => {
    const request = {
      headers: { 'x-voucha-bot-score': ['7', '42'] },
    } as unknown as IncomingMessage
    markAuthenticatedOriginRequest(request)

    expect(getTrustedCloudflareBotScore(request)).toBeUndefined()
  })
})

function requestWithScore(score: string): IncomingMessage {
  return { headers: { 'x-voucha-bot-score': score } } as unknown as IncomingMessage
}
