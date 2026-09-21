import type { APIGatewayProxyEvent } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import { RequestParseError } from '../errors.mts'
import { parseRequest } from './parse.mts'

function placementEvent(
  rawPath: string,
  params: Record<string, string> = { w: '400' },
): APIGatewayProxyEvent {
  return {
    headers: {},
    queryStringParameters: params,
    rawPath,
  } as unknown as APIGatewayProxyEvent
}

describe('parseRequest placement routes', () => {
  it('parses a placement-bound route without treating placement segments as the S3 key', () => {
    const event = placementEvent(
      '/images/placements/00000000-0000-7000-8000-000000000001/3/00000000-0000-7000-8000-000000000002',
    )

    expect(parseRequest(event)).toMatchObject({
      key: '00000000-0000-7000-8000-000000000002',
      placementId: '00000000-0000-7000-8000-000000000001',
      placementRevision: 3,
      width: 400,
    })
  })

  it.each([
    ['invalid placement ID', 'not-a-uuid', '1'],
    ['negative placement revision', '00000000-0000-7000-8000-000000000001', '-1'],
    ['non-canonical placement revision', '00000000-0000-7000-8000-000000000001', '01'],
  ])('rejects %s', (_label, placementId, revision) => {
    const event = placementEvent(
      `/images/placements/${placementId}/${revision}/00000000-0000-7000-8000-000000000002`,
    )

    expect(() => parseRequest(event)).toThrow(RequestParseError)
  })

  it('rejects a placement revision outside the safe integer range', () => {
    const event = placementEvent(
      '/images/placements/00000000-0000-7000-8000-000000000001/9007199254740993/00000000-0000-7000-8000-000000000002',
    )

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid placement revision')
  })

  it('accepts an initial placement revision of zero', () => {
    const event = placementEvent(
      '/images/placements/00000000-0000-7000-8000-000000000001/0/00000000-0000-7000-8000-000000000002',
    )

    expect(parseRequest(event).placementRevision).toBe(0)
  })

  it('rejects a malformed reserved placement route', () => {
    const event = placementEvent('/images/placements/not-a-complete-binding')

    expect(() => parseRequest(event)).toThrow('Invalid placement route')
  })

  it('does not allow a query key to replace the placement-bound asset', () => {
    const event = placementEvent(
      '/images/placements/00000000-0000-7000-8000-000000000001/3/bound-image.png',
      { key: 'forged-image.png', w: '400' },
    )

    expect(parseRequest(event).key).toBe('bound-image.png')
  })
})
