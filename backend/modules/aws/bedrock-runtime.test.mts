import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { installApiEgressProxyRoutingResolver } from '@modules/api-egress-proxy'
import { BedrockEmbeddingsClient } from './bedrock-runtime.mts'
import { onGracefulShutdown } from '../../data-stores/graceful-shutdown/index.mts'

describe('BedrockEmbeddingsClient', () => {
  afterAll(async () => {
    installApiEgressProxyRoutingResolver(() => false)
    await onGracefulShutdown('SIGTERM')
    vi.unstubAllEnvs()
  })

  it('preserves receivers for proxy target and SDK client methods', () => {
    const targetMarker = Symbol('targetMarker')
    const methodName = Symbol('methodName')
    const markerName = Symbol('markerName')
    const proxyTarget = BedrockEmbeddingsClient as unknown as {
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

  it('keeps client creation lazy and fails closed when selected proxy configuration is absent', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', '')
    installApiEgressProxyRoutingResolver(() => true)
    expect(() => BedrockEmbeddingsClient.config).toThrow(
      'API_EGRESS_PROXY_URL is required when API egress proxying is enabled',
    )
  })

  it('creates and drains the proxy-routed client without restarting the SDK seam', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    vi.stubEnv('BEDROCK_AWS_ACCESS_KEY_ID', 'synthetic-bedrock-access-key')
    vi.stubEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', 'synthetic-bedrock-secret-key')
    vi.stubEnv('BEDROCK_AWS_SESSION_TOKEN', 'synthetic-bedrock-session-token')
    installApiEgressProxyRoutingResolver(() => false)
    const directConfig = BedrockEmbeddingsClient.config
    installApiEgressProxyRoutingResolver(provider => provider === 'bedrock_embeddings_enabled')

    const proxiedConfig = BedrockEmbeddingsClient.config
    expect(proxiedConfig).not.toBe(directConfig)
    expect(proxiedConfig.requestHandler).toBeDefined()
    await expect(proxiedConfig.credentials()).resolves.toMatchObject({
      accessKeyId: 'synthetic-bedrock-access-key',
      secretAccessKey: 'synthetic-bedrock-secret-key',
      sessionToken: 'synthetic-bedrock-session-token',
    })
    expect(BedrockEmbeddingsClient.config).toBe(proxiedConfig)
    installApiEgressProxyRoutingResolver(() => false)
    expect(BedrockEmbeddingsClient.config).toBe(directConfig)

    const destroy = vi.spyOn(BedrockRuntimeClient.prototype, 'destroy')
    try {
      await Promise.all([onGracefulShutdown('SIGTERM'), onGracefulShutdown('SIGTERM')])
      expect(destroy).toHaveBeenCalledTimes(2)
      await onGracefulShutdown('SIGTERM')
      expect(destroy).toHaveBeenCalledTimes(2)
    } finally {
      destroy.mockRestore()
    }
  })
})
