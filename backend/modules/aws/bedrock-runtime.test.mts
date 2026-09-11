import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installApiEgressProxyRoutingResolver,
  resetApiEgressProxyTransportForTest,
} from '@modules/api-egress-proxy'
import { BedrockEmbeddingsClient, closeBedrockRuntimeClients } from './bedrock-runtime.mts'

describe('BedrockEmbeddingsClient', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await resetApiEgressProxyTransportForTest()
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

  it('creates and drains the proxy-routed client without restarting the SDK seam', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    installApiEgressProxyRoutingResolver(() => false)
    const directConfig = BedrockEmbeddingsClient.config
    installApiEgressProxyRoutingResolver(provider => provider === 'bedrock_embeddings_enabled')

    const proxiedConfig = BedrockEmbeddingsClient.config
    expect(proxiedConfig).not.toBe(directConfig)
    expect(proxiedConfig.requestHandler).toBeDefined()

    await Promise.all([closeBedrockRuntimeClients(), closeBedrockRuntimeClients()])
  })
})
