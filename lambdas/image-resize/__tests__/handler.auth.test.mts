import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { createLambdaHandler } from '../handler.mts'
import type { EnvironmentConfig, SideloadConfig } from '../config.mts'

const mockEnvConfig: EnvironmentConfig = {
  s3_bucket_origin: { bucket: 'test-origin-bucket', region: 'us-west-2' },
  s3_bucket_cache: { bucket: 'test-cache-bucket', region: 'us-west-2' },
  widths: [100, 200, 400, 800],
  qualities: [75, 85, 95],
  maxHeight: 2400,
}

const mockSideloadConfig: SideloadConfig = {
  s3_bucket_cache: { bucket: 'test-cache-bucket', region: 'us-west-2' },
  widths: [100, 200, 400, 800],
  qualities: [75, 85, 95],
  maxHeight: 2400,
}

describe('handler request boundary', () => {
  let handler: ReturnType<typeof createLambdaHandler>

  beforeEach(() => {
    handler = createLambdaHandler({ source: mockEnvConfig, sideload: mockSideloadConfig })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request without a path as an invalid placement route', async () => {
    const result = await handler({
      queryStringParameters: { key: 'test.jpg', w: '200' },
      headers: {},
    } as unknown as APIGatewayProxyEvent)

    expect(result.statusCode).toBe(400)
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid placement route' })
  })

  it('does not resolve sideload signing keys for ordinary image requests', async () => {
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS_PARAMETER', '/voucha/staging/sideload-keys')

    const result = await handler({
      queryStringParameters: { key: 'test.jpg', w: 'invalid' },
      headers: {},
      path: '/images/test.jpg',
    } as unknown as APIGatewayProxyEvent)

    expect(result.statusCode).toBe(400)
  })
})
