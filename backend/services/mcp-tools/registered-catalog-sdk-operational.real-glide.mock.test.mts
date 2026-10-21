import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createTestUserDirect } from '@voucha/test-helpers'
import { sdkMergedSuccessNames } from '@voucha/test-helpers/mcp-sdk-success-names'
import {
  createSdkCatalogAssertions,
  connectSdkCatalog,
  sdkCatalogCases,
} from '@voucha/test-helpers/mcp-sdk-catalog'
import { describe, expect, it, vi } from 'vitest'

const { prefix } = vi.hoisted(() => {
  const inherited = process.env['VALKEY_WORKER_QUEUE_URL'] ?? process.env['VALKEY_URL']
  if (!inherited) throw new Error('Real operational SDK tests require the worktree queue URL')
  const url = new URL(inherited)
  const namespace = BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`).toString()
  url.pathname = `/${namespace}`
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  return { prefix: `voucha_qdb_${namespace}` }
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('operational job through the registered admin SDK', () => {
  it('enqueues an owned scheduled job and validates its advertised output', async () => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUserDirect({ administrator: true })
    const client = await connectSdkCatalog(sdkCatalogCases[3]!, admin, async (url, fetch) => {
      const sdk = new Client({ name: 'voucha-operational-catalog-test', version: '1.0.0' })
      await sdk.connect(new StreamableHTTPClientTransport(url, { fetch }))
      return sdk
    })
    try {
      const catalog = await createSdkCatalogAssertions(client)
      const name = 'run_operational_job'
      expect(
        await catalog.callAndValidate(name, 'scheduled', {
          id: 'kagi-smallweb-sync',
        }),
      ).toBeDefined()
      expect([name]).toEqual([...sdkMergedSuccessNames.operationalFixture])
    } finally {
      await client.close()
    }
  })
})
