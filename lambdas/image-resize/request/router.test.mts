import { describe, it, expect } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { parseRouterRequest } from './router.mts'

function createMockEvent(
  path: string,
  pathParameters: Record<string, string> = {},
  queryParams: Record<string, string> = {},
): APIGatewayProxyEvent {
  return {
    path,
    pathParameters,
    queryStringParameters: queryParams,
    headers: {},
  } as unknown as APIGatewayProxyEvent
}

function toOgBase64url(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

describe('parseRouterRequest', () => {
  describe('S3 route detection', () => {
    it('should detect S3 route from query params', () => {
      const event = createMockEvent('/images', {}, { key: 'image.jpg', w: '800' })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('s3')
      const s3Result1 = result as Extract<typeof result, { type: 's3' }>
      expect(s3Result1.key).toBe('image.jpg')
      expect(s3Result1.width).toBe(800)
    })

    it('should parse S3 route with all params', () => {
      const event = createMockEvent(
        '/images',
        {},
        {
          key: 'image.jpg',
          w: '1200',
          h: '800',
          q: '90',
          l: '1',
          p: '1',
          f: 'webp',
        },
      )

      const result = parseRouterRequest(event)

      expect(result.type).toBe('s3')
      const s3Result2 = result as Extract<typeof result, { type: 's3' }>
      expect(s3Result2.key).toBe('image.jpg')
      expect(s3Result2.width).toBe(1200)
      expect(s3Result2.height).toBe(800)
      expect(s3Result2.quality).toBe(90)
      expect(s3Result2.lossless).toBe(true)
      expect(s3Result2.progressive).toBe(true)
      expect(s3Result2.format).toBe('webp')
    })
  })

  describe('Sideload route detection', () => {
    it('should detect sideload route from path', () => {
      const url = 'https://example.com/image.jpg'
      const base64url = Buffer.from(url).toString('base64')
      const event = createMockEvent(`/sideload/${base64url}`, { base64url }, { w: '800' })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('sideload')
      const sideloadResult1 = result as Extract<typeof result, { type: 'sideload' }>
      expect(sideloadResult1.url).toBe(url)
      expect(sideloadResult1.width).toBe(800)
    })

    it('should detect sideload route from Function URL rawPath', () => {
      const url = 'https://example.com/function-url-image.jpg'
      const base64url = Buffer.from(url).toString('base64url')
      const event = {
        rawPath: `/sideload/${base64url}`,
        pathParameters: null,
        queryStringParameters: { w: '400' },
        headers: {},
      } as unknown as APIGatewayProxyEvent

      const result = parseRouterRequest(event)

      expect(result).toMatchObject({ type: 'sideload', url, width: 400 })
    })

    it('should detect sideload route from path parameters', () => {
      const url = 'https://example.com/image.jpg'
      const base64url = Buffer.from(url).toString('base64')
      const event = createMockEvent('/other-path', { base64url }, { w: '800' })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('sideload')
      const sideloadResult2 = result as Extract<typeof result, { type: 'sideload' }>
      expect(sideloadResult2.url).toBe(url)
    })

    it('should parse sideload route with all params', () => {
      const url = 'https://example.com/image.jpg'
      const base64url = Buffer.from(url).toString('base64')
      const event = createMockEvent(
        `/sideload/${base64url}`,
        { base64url },
        {
          w: '1200',
          h: '800',
          q: '90',
          l: '1',
          p: '1',
          f: 'avif',
        },
      )

      const result = parseRouterRequest(event)

      expect(result.type).toBe('sideload')
      const sideloadResult3 = result as Extract<typeof result, { type: 'sideload' }>
      expect(sideloadResult3.url).toBe(url)
      expect(sideloadResult3.width).toBe(1200)
      expect(sideloadResult3.height).toBe(800)
      expect(sideloadResult3.quality).toBe(90)
      expect(sideloadResult3.lossless).toBe(true)
      expect(sideloadResult3.progressive).toBe(true)
      expect(sideloadResult3.format).toBe('avif')
    })

    it('should handle sideload route with complex URL', () => {
      const url = 'https://cdn.example.com/images/2024/photo.jpg?v=123&quality=high'
      const base64url = Buffer.from(url).toString('base64')
      const event = createMockEvent(`/sideload/${base64url}`, { base64url }, { w: '800' })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('sideload')
      const sideloadResult4 = result as Extract<typeof result, { type: 'sideload' }>
      expect(sideloadResult4.url).toBe(url)
      expect(sideloadResult4.width).toBe(800)
    })
  })

  describe('OG route detection', () => {
    it('should detect og route from path', () => {
      const params = {
        type: 'generic',
        eyebrow: 'e',
        title: 't',
        description: 'd',
        domainLabel: 'z',
      }
      const ogBase64url = toOgBase64url(params)
      const event = createMockEvent(`/og/${ogBase64url}`, { ogBase64url })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('og')
      const ogResult = result as Extract<typeof result, { type: 'og' }>
      expect(ogResult.params).toEqual(params)
    })

    it('should detect og route from path parameters without the /og/ prefix', () => {
      const params = { type: 'landing', displayName: 'Ada', username: 'ada', topCategories: [] }
      const ogBase64url = toOgBase64url(params)
      const event = createMockEvent('/other-path', { ogBase64url })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('og')
    })

    it('should not collide with sideload detection', () => {
      const params = {
        type: 'generic',
        eyebrow: 'e',
        title: 't',
        description: 'd',
        domainLabel: 'z',
      }
      const ogBase64url = toOgBase64url(params)
      const event = createMockEvent(`/og/${ogBase64url}`, { ogBase64url })

      const result = parseRouterRequest(event)

      expect(result.type).not.toBe('sideload')
    })
  })

  describe('Route prioritization', () => {
    it('should prefer og route over sideload when both indicators are somehow present', () => {
      const params = {
        type: 'generic',
        eyebrow: 'e',
        title: 't',
        description: 'd',
        domainLabel: 'z',
      }
      const ogBase64url = toOgBase64url(params)
      const sideloadBase64url = Buffer.from('https://example.com/image.jpg').toString('base64')
      const event = createMockEvent(
        `/og/${ogBase64url}`,
        { ogBase64url, base64url: sideloadBase64url },
        { w: '800' },
      )

      const result = parseRouterRequest(event)

      expect(result.type).toBe('og')
    })

    it('should prefer sideload route when path contains /sideload/', () => {
      const url = 'https://example.com/image.jpg'
      const base64url = Buffer.from(url).toString('base64')
      // Even with S3 query params present
      const event = createMockEvent(
        `/sideload/${base64url}`,
        { base64url },
        { w: '800', key: 'ignored.jpg' },
      )

      const result = parseRouterRequest(event)

      expect(result.type).toBe('sideload')
    })

    it('should use S3 route when no sideload indicators present', () => {
      const event = createMockEvent('/images', {}, { key: 'image.jpg', w: '800' })

      const result = parseRouterRequest(event)

      expect(result.type).toBe('s3')
    })
  })
})
