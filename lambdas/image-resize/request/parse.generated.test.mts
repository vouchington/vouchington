import { describe, it, expect } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { parseRequest } from './parse.mts'
import { RequestParseError } from '../errors.mts'

function createMockEvent(
  params: Record<string, string> = {},
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    queryStringParameters: params,
    headers,
  } as APIGatewayProxyEvent
}

describe('parseRequest', () => {
  it('should parse valid request with all required params', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800' })
    const result = parseRequest(event)

    expect(result.key).toBe('test.jpg')
    expect(result.width).toBe(800)
    expect(result.quality).toBe(75)
    expect(result.lossless).toBe(false)
    expect(result.progressive).toBe(false)
    expect(result.format).toBeUndefined()
  })

  it('should parse optional height', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', h: '600' })
    const result = parseRequest(event)

    expect(result.height).toBe(600)
  })

  it('should parse quality parameter', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', q: '90' })
    const result = parseRequest(event)

    expect(result.quality).toBe(90)
  })

  it('should parse lossless parameter (1)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', l: '1' })
    const result = parseRequest(event)

    expect(result.lossless).toBe(true)
  })

  it('should parse lossless parameter (true)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', l: 'true' })
    const result = parseRequest(event)

    expect(result.lossless).toBe(true)
  })

  it('should parse progressive parameter (1)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', p: '1' })
    const result = parseRequest(event)

    expect(result.progressive).toBe(true)
  })

  it('should parse progressive parameter (true)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', p: 'true' })
    const result = parseRequest(event)

    expect(result.progressive).toBe(true)
  })

  it('should parse format parameter', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', f: 'webp' })
    const result = parseRequest(event)

    expect(result.format).toBe('webp')
  })

  it('should capture Accept header', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800' }, { Accept: 'image/webp,image/*' })
    const result = parseRequest(event)

    expect(result.acceptHeader).toBe('image/webp,image/*')
  })

  it('should capture accept header (lowercase)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800' }, { accept: 'image/avif' })
    const result = parseRequest(event)

    expect(result.acceptHeader).toBe('image/avif')
  })

  it('should throw error for missing key', () => {
    const event = createMockEvent({ w: '800' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Missing required parameter: key')
  })

  it('extracts key from event.path when key query param is absent (production: CloudFront → Lambda Function URL)', () => {
    // In production, CloudFront forwards /images/{key} as-is without injecting
    // a `key` query param. http-request-to-lambda-event.mts does the injection
    // only in local dev.
    const event = {
      ...createMockEvent({ w: '800' }),
      path: '/images/photos/cat.jpg',
    }
    const result = parseRequest(event as APIGatewayProxyEvent)

    expect(result.key).toBe('photos/cat.jpg')
    expect(result.width).toBe(800)
  })

  it('extracts key from rawPath (Lambda Function URL V2 payload format)', () => {
    const event = {
      ...createMockEvent({ w: '400' }),
      rawPath: '/images/test-image.png',
    }
    const result = parseRequest(event as APIGatewayProxyEvent)

    expect(result.key).toBe('test-image.png')
  })

  it('prefers key query param over path when both are present (local dev fallback)', () => {
    const event = {
      ...createMockEvent({ key: 'query-key.jpg', w: '200' }),
      path: '/images/path-key.jpg',
    }
    const result = parseRequest(event as APIGatewayProxyEvent)

    expect(result.key).toBe('query-key.jpg')
  })

  it('should throw error for missing width', () => {
    const event = createMockEvent({ key: 'test.jpg' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Missing required parameter: w')
  })

  it('should throw error for invalid width (non-numeric)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: 'invalid' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid width')
  })

  it('should throw error for invalid width (zero)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '0' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid width')
  })

  it('should throw error for invalid width (negative)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '-100' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid width')
  })

  it('should throw error for invalid height (non-numeric)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', h: 'invalid' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid height')
  })

  it('should throw error for invalid height (zero)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', h: '0' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid height')
  })

  it('should throw error for invalid height (negative)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', h: '-100' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid height')
  })

  it('should throw error for invalid quality (below range)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', q: '0' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid quality')
  })

  it('should throw error for invalid quality (above range)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', q: '101' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid quality')
  })

  it('should throw error for invalid quality (non-numeric)', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', q: 'high' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid quality')
  })

  it('should throw error for invalid format', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800', f: 'bmp' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid format')
  })

  it('should accept multi-segment key with forward slashes', () => {
    // /images/{key} captures everything after `/images/` (including slashes),
    // so parseRequest must accept nested prefixes like `photos/cat.jpg`.
    const event = createMockEvent({ key: 'photos/2024/cat.jpg', w: '800' })
    const result = parseRequest(event)

    expect(result.key).toBe('photos/2024/cat.jpg')
  })

  it('should reject key with empty path segments', () => {
    const event = createMockEvent({ key: 'photos//cat.jpg', w: '800' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid key')
  })

  it('should reject key with leading slash', () => {
    const event = createMockEvent({ key: '/photos/cat.jpg', w: '800' })

    expect(() => parseRequest(event)).toThrow(RequestParseError)
    expect(() => parseRequest(event)).toThrow('Invalid key')
  })

  describe('key path-traversal hardening', () => {
    // S3's keyspace is flat, so these never escape a bucket, but parseRequest
    // rejects them anyway: traversal-shaped segments, encoded traversal and null
    // bytes (excluded from the charset), and control/whitespace characters.
    it.each([
      ['classic traversal', '../../../etc/passwd'],
      ['interior traversal segment', 'a/../b'],
      ['trailing traversal segment', 'photos/..'],
      ['lone dot segment', 'a/./b'],
      ['lone dot key', '.'],
      ['lone dot-dot key', '..'],
      ['percent-encoded traversal', '%2e%2e%2fetc%2fpasswd'],
      ['percent-encoded null byte', 'cat%00.jpg'],
      ['raw null byte', 'cat\0.jpg'],
      ['backslash traversal', '..\\..\\secret'],
      ['embedded space', 'cat .jpg'],
    ])('should reject %s (%j)', (_label, key) => {
      const event = createMockEvent({ key, w: '800' })

      expect(() => parseRequest(event)).toThrow(RequestParseError)
      expect(() => parseRequest(event)).toThrow('Invalid key')
    })

    it.each([
      ['dotted hex prefix', 'abc.def/cat.jpg'],
      ['uuid v7 key', '00000000-0000-7000-8000-000000000001'],
      ['leading-dot filename', '.hidden.jpg'],
    ])('should accept legitimate %s (%j)', (_label, key) => {
      const event = createMockEvent({ key, w: '800' })

      expect(parseRequest(event).key).toBe(key)
    })
  })
})
