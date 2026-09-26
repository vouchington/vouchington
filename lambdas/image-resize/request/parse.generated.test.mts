import { describe, it, expect } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { parseRequest } from './parse.mts'
import { RequestParseError } from '../errors.mts'

function createMockEvent(
  params: Record<string, string> = {},
  headers: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    rawPath:
      '/images/placements/00000000-0000-7000-8000-000000000001/0/00000000-0000-7000-8000-000000000002',
    queryStringParameters: params,
    headers,
  } as unknown as APIGatewayProxyEvent
}

describe('parseRequest', () => {
  it('should parse valid request with all required params', () => {
    const event = createMockEvent({ key: 'test.jpg', w: '800' })
    const result = parseRequest(event)

    expect(result.key).toBe('00000000-0000-7000-8000-000000000002')
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
})
