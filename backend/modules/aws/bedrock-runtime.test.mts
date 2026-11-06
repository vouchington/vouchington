import { once } from 'node:events'
import { createServer } from 'node:http'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { installApiEgressProxyRoutingResolver } from '@modules/api-egress-proxy'
import { fetchWithTimeoutSimple, getExternalRequestDispatcher } from '@modules/utils/http'
import { BedrockEmbeddingsClient } from './bedrock-runtime.mts'

describe('BedrockEmbeddingsClient', () => {
  afterAll(() => {
    installApiEgressProxyRoutingResolver(() => false)
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

    const destroyedClients: BedrockRuntimeClient[] = []
    const destroy = vi
      .spyOn(BedrockRuntimeClient.prototype, 'destroy')
      .mockImplementation(function (this: BedrockRuntimeClient) {
        destroyedClients.push(this)
      })
    try {
      expect(proxyTarget[methodName]()).toBe(targetMarker)
      expect(() => proxyTarget.destroy()).not.toThrow()
      expect(destroy).toHaveBeenCalledTimes(1)
      expect(destroyedClients[0]).toBeInstanceOf(BedrockRuntimeClient)
      expect(destroyedClients[0]?.config).toBe(BedrockEmbeddingsClient.config)
    } finally {
      destroy.mockRestore()
      Reflect.deleteProperty(proxyTarget, methodName)
      Reflect.deleteProperty(proxyTarget, markerName)
    }
  })

  it('keeps client creation lazy and fails closed when selected proxy configuration is absent', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', '')
    installApiEgressProxyRoutingResolver(() => true)
    expect(() => BedrockEmbeddingsClient.config).toThrow(
      'API_EGRESS_PROXY_URL is required when API egress proxying is enabled',
    )
  })

  it('forwards destroy to direct and proxy-routed SDK clients', async () => {
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

    const server = createServer((_request, response) => response.end('owned HTTP survives'))
    const destroyedClients: BedrockRuntimeClient[] = []
    const destroy = vi
      .spyOn(BedrockRuntimeClient.prototype, 'destroy')
      .mockImplementation(function (this: BedrockRuntimeClient) {
        destroyedClients.push(this)
      })
    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Expected owned HTTP address')
      const dispatcher = getExternalRequestDispatcher()

      BedrockEmbeddingsClient.destroy()
      installApiEgressProxyRoutingResolver(provider => provider === 'bedrock_embeddings_enabled')
      BedrockEmbeddingsClient.destroy()
      expect(destroy).toHaveBeenCalledTimes(2)
      expect(destroyedClients[0]).toBeInstanceOf(BedrockRuntimeClient)
      expect(destroyedClients[1]).toBeInstanceOf(BedrockRuntimeClient)
      expect(destroyedClients[0]?.config).toBe(directConfig)
      expect(destroyedClients[1]?.config).toBe(proxiedConfig)
      expect(getExternalRequestDispatcher()).toBe(dispatcher)
      const response = await fetchWithTimeoutSimple(`http://127.0.0.1:${address.port}/`, 5_000)
      await expect(response.text()).resolves.toBe('owned HTTP survives')
    } finally {
      destroy.mockRestore()
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()))
      })
    }
  })
})
