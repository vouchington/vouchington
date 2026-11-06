import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { describe, expect, it, vi } from 'vitest'
import * as shutdown from '@data-stores/graceful-shutdown'
import { installApiEgressProxyRoutingResolver } from '@modules/api-egress-proxy'
import './config.mts'
import './credentials.mts'

const { destroyedClients } = vi.hoisted(() => {
  const destroyedClients: BedrockRuntimeClient[] = []
  return { destroyedClients }
})

vi.mock<typeof import('@aws-sdk/client-bedrock-runtime')>(
  import('@aws-sdk/client-bedrock-runtime'),
  async importOriginal => {
    const actual = await importOriginal()
    return {
      ...actual,
      BedrockRuntimeClient: class extends actual.BedrockRuntimeClient {
        override destroy(): void {
          destroyedClients.push(this)
          super.destroy()
        }
      },
    }
  },
)

describe('Bedrock client drain registration', () => {
  it('registers a scoped drain that destroys both clients and resets their cached instances', async () => {
    const registration = vi.spyOn(shutdown, 'addGracefulShutdownDrainCallback')
    let close: (() => Promise<void>) | undefined
    try {
      const { BedrockEmbeddingsClient } = await import('./bedrock-runtime.mts')
      expect(registration).toHaveBeenCalledTimes(1)
      close = registration.mock.calls[0]?.[0]
      registration.mockRestore()
      if (!close) throw new Error('Expected a Bedrock drain registration')

      await close()
      expect(destroyedClients).toHaveLength(0)
      vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
      vi.stubEnv('BEDROCK_AWS_ACCESS_KEY_ID', 'synthetic-bedrock-access-key')
      vi.stubEnv('BEDROCK_AWS_SECRET_ACCESS_KEY', 'synthetic-bedrock-secret-key')
      vi.stubEnv('BEDROCK_AWS_SESSION_TOKEN', 'synthetic-bedrock-session-token')
      installApiEgressProxyRoutingResolver(() => false)
      const directConfig = BedrockEmbeddingsClient.config
      installApiEgressProxyRoutingResolver(provider => provider === 'bedrock_embeddings_enabled')
      const proxiedConfig = BedrockEmbeddingsClient.config
      expect(proxiedConfig).not.toBe(directConfig)
      await expect(proxiedConfig.credentials()).resolves.toMatchObject({
        accessKeyId: 'synthetic-bedrock-access-key',
        secretAccessKey: 'synthetic-bedrock-secret-key',
        sessionToken: 'synthetic-bedrock-session-token',
      })

      await Promise.all([close(), close()])
      expect(destroyedClients).toHaveLength(2)
      expect(destroyedClients[0]?.config).toBe(directConfig)
      expect(destroyedClients[1]?.config).toBe(proxiedConfig)
      await close()
      expect(destroyedClients).toHaveLength(2)

      installApiEgressProxyRoutingResolver(() => false)
      expect(BedrockEmbeddingsClient.config).not.toBe(directConfig)
      installApiEgressProxyRoutingResolver(provider => provider === 'bedrock_embeddings_enabled')
      expect(BedrockEmbeddingsClient.config).not.toBe(proxiedConfig)
      await close()
      expect(destroyedClients).toHaveLength(4)
    } finally {
      registration.mockRestore()
      try {
        await close?.()
      } finally {
        installApiEgressProxyRoutingResolver(() => false)
        vi.unstubAllEnvs()
      }
    }
  })
})
