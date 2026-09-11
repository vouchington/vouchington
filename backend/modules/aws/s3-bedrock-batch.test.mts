import { S3Client } from '@aws-sdk/client-s3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AWS_DUALSTACK_CLIENT_CONFIG, BEDROCK_AWS_REGION } from './config.mts'
import { S3BedrockBatchClient } from './s3-bedrock-batch.mts'

describe('S3BedrockBatchClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('requires an injected bucket outside tests', async () => {
    vi.stubEnv('S3_BUCKET_BEDROCK_BATCH', ' ')
    vi.stubEnv('VITEST', 'false')
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()

    await expect(import('./s3-bedrock-batch.mts')).rejects.toThrow(
      'Missing S3_BUCKET_BEDROCK_BATCH',
    )
  })

  it('preserves receivers for proxy target and SDK client methods', () => {
    const targetMarker = Symbol('targetMarker')
    const methodName = Symbol('methodName')
    const markerName = Symbol('markerName')
    const proxyTarget = S3BedrockBatchClient as unknown as {
      [markerName]: symbol
      [methodName]: () => symbol
      destroy: () => void
    }
    Object.defineProperty(proxyTarget, markerName, {
      configurable: true,
      value: targetMarker,
    })
    Object.defineProperty(proxyTarget, methodName, {
      configurable: true,
      value() {
        return this[markerName]
      },
    })

    expect(proxyTarget[methodName]()).toBe(targetMarker)
    expect(() => proxyTarget.destroy()).not.toThrow()
  })

  it('is not an instanceof S3Client and forwards send through the lazy client', () => {
    expect(S3BedrockBatchClient instanceof S3Client).toBe(false)
    expect(typeof S3BedrockBatchClient.send).toBe('function')
    expect(S3BedrockBatchClient.config).toBeDefined()
  })

  it('pins the constructed S3 client to BEDROCK_AWS_REGION with dual-stack', async () => {
    const config = S3BedrockBatchClient.config as {
      region: () => Promise<string>
      useDualstackEndpoint: () => Promise<boolean>
    }
    await expect(config.region()).resolves.toBe(BEDROCK_AWS_REGION)
    await expect(config.useDualstackEndpoint()).resolves.toBe(
      AWS_DUALSTACK_CLIENT_CONFIG.useDualstackEndpoint,
    )
  })
})
