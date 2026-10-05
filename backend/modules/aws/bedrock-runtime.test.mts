import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiEgressProxyTransport } from '@modules/api-egress-proxy'
import { createHttpDispatchers } from '@modules/utils'
import { createBedrockRuntimeClients } from './bedrock-runtime.mts'

describe('BedrockEmbeddingsClient', () => {
  let direct: ReturnType<typeof createHttpDispatchers>
  let transport: ReturnType<typeof createApiEgressProxyTransport>
  let clients: ReturnType<typeof createBedrockRuntimeClients>

  beforeEach(() => {
    direct = createHttpDispatchers()
    transport = createApiEgressProxyTransport(direct)
    clients = createBedrockRuntimeClients(transport)
  })

  afterEach(async () => {
    try {
      await clients[Symbol.asyncDispose]()
    } finally {
      try {
        await transport[Symbol.asyncDispose]()
      } finally {
        await direct[Symbol.asyncDispose]()
        vi.unstubAllEnvs()
      }
    }
  })

  it('preserves receivers for proxy target and SDK client methods', () => {
    const targetMarker = Symbol('targetMarker')
    const methodName = Symbol('methodName')
    const markerName = Symbol('markerName')
    const proxyTarget = clients.BedrockEmbeddingsClient as unknown as {
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
    transport.installApiEgressProxyRoutingResolver(() => true)
    expect(() => clients.BedrockEmbeddingsClient.config).toThrow(
      'API_EGRESS_PROXY_URL is required when API egress proxying is enabled',
    )
  })

  it('creates and drains the proxy-routed client without restarting the SDK seam', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    transport.installApiEgressProxyRoutingResolver(() => false)
    const directConfig = clients.BedrockEmbeddingsClient.config
    transport.installApiEgressProxyRoutingResolver(
      provider => provider === 'bedrock_embeddings_enabled',
    )

    const proxiedConfig = clients.BedrockEmbeddingsClient.config
    expect(proxiedConfig).not.toBe(directConfig)
    expect(proxiedConfig.requestHandler).toBeDefined()
    expect(clients.BedrockEmbeddingsClient.config).toBe(proxiedConfig)
    transport.installApiEgressProxyRoutingResolver(() => false)
    expect(clients.BedrockEmbeddingsClient.config).toBe(directConfig)

    const destroy = vi.spyOn(BedrockRuntimeClient.prototype, 'destroy')
    try {
      await Promise.all([
        clients.closeBedrockRuntimeClients(),
        clients.closeBedrockRuntimeClients(),
      ])
      expect(destroy).toHaveBeenCalledTimes(2)
      await clients[Symbol.asyncDispose]()
      expect(destroy).toHaveBeenCalledTimes(2)
    } finally {
      destroy.mockRestore()
    }
  })
})
