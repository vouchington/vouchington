import { beforeEach, describe, expect, it } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { createLambdaHandler } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'

describe('handler.generated', () => {
  const mockEnvConfig: EnvironmentConfig = {
    s3_bucket_origin: {
      bucket: 'test-origin-bucket',
      region: 'us-west-2',
    },
    s3_bucket_cache: {
      bucket: 'test-cache-bucket',
      region: 'us-west-2',
    },
    widths: [100, 200, 400, 800],
    qualities: [75, 85, 95],
    maxHeight: 2400,
  }

  const mockSideloadConfig: SideloadConfig = {
    s3_bucket_cache: {
      bucket: 'test-cache-bucket',
      region: 'us-west-2',
    },
    widths: [100, 200, 400, 800],
    qualities: [75, 85, 95],
    maxHeight: 2400,
  }

  function createMockEvent(
    params: Record<string, string>,
    headers: Record<string, string> = {},
  ): APIGatewayProxyEvent {
    return {
      queryStringParameters: params,
      headers,
    } as unknown as APIGatewayProxyEvent
  }

  describe('handler error handling tests', () => {
    let handler: ReturnType<typeof createLambdaHandler>

    beforeEach(() => {
      handler = createLambdaHandler({
        source: mockEnvConfig,
        sideload: mockSideloadConfig,
      })
    })

    describe('request validation errors', () => {
      it('should return 400 for missing key parameter', async () => {
        const event = createMockEvent({
          w: '200',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('key')
      })

      it('should return 400 for missing width parameter', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('w')
      })

      it('should return 400 for invalid width', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
          w: 'invalid',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('width')
      })

      it('should return 400 for invalid format', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
          w: '200',
          f: 'bmp',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
        const body = JSON.parse(result.body)
        expect(body.error).toContain('format')
      })

      it('should return 400 for negative width', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
          w: '-100',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
      })

      it('should return 400 for zero width', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
          w: '0',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
      })

      it('should return 400 for invalid quality (too low)', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
          w: '200',
          q: '0',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
      })

      it('should return 400 for invalid quality (too high)', async () => {
        const event = createMockEvent({
          key: 'test.jpg',
          w: '200',
          q: '101',
        })

        const result = await handler(event)

        expect(result.statusCode).toBe(400)
      })
    })
  })
})
