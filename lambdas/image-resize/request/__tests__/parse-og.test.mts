import { describe, it, expect } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { parseOgRequest } from '../parse-og.mts'
import { RequestParseError } from '../../errors.mts'
import { toBase64Url } from '../../../test-helpers/image-resize/index.mts'

function toOgBase64url(payload: unknown): string {
  return toBase64Url(JSON.stringify(payload))
}

function createMockEvent(
  ogBase64url: string,
  queryParams: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    pathParameters: { ogBase64url },
    queryStringParameters: queryParams,
  } as unknown as APIGatewayProxyEvent
}

describe('parseOgRequest', () => {
  it('parses a valid generic payload', () => {
    const params = {
      type: 'generic',
      eyebrow: 'Voucha',
      title: 'A title',
      description: 'A description',
      domainLabel: 'voucha.ai',
    }
    const event = createMockEvent(toOgBase64url(params))
    const result = parseOgRequest(event)
    expect(result.params).toEqual(params)
  })

  it('parses a valid landing payload', () => {
    const params = {
      type: 'landing',
      displayName: 'Ada',
      username: 'ada',
      topCategories: ['math'],
    }
    const event = createMockEvent(toOgBase64url(params))
    const result = parseOgRequest(event)
    expect(result.params).toEqual(params)
  })

  it('throws on missing base64url', () => {
    const event = createMockEvent('')
    event.pathParameters = {}
    expect(() => parseOgRequest(event)).toThrow(RequestParseError)
    expect(() => parseOgRequest(event)).toThrow('Missing base64url in path')
  })

  it('throws on malformed base64url', () => {
    // Not valid base64 at all (contains characters outside the alphabet).
    const event = createMockEvent('!!!not-base64!!!')
    expect(() => parseOgRequest(event)).toThrow(RequestParseError)
  })

  it('throws on base64url that decodes to invalid JSON', () => {
    const event = createMockEvent(toBase64Url('not json'))
    expect(() => parseOgRequest(event)).toThrow(RequestParseError)
    expect(() => parseOgRequest(event)).toThrow('Invalid base64url or JSON')
  })

  it('throws when required params are missing for the declared type', () => {
    const event = createMockEvent(toOgBase64url({ type: 'generic', eyebrow: 'Voucha' }))
    expect(() => parseOgRequest(event)).toThrow(RequestParseError)
  })
})
