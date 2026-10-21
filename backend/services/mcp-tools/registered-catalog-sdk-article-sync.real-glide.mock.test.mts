import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { articleSync } from '@queues/article-sync/queues'
import { createTestUser } from '@voucha/test-helpers'
import {
  createSdkCatalogAssertions,
  connectSdkCatalog,
  sdkCatalogCases,
} from '@voucha/test-helpers/mcp-sdk-catalog'
import { describe, expect, it, vi } from 'vitest'

const { prefix } = vi.hoisted(() => {
  const inherited = process.env['VALKEY_WORKER_QUEUE_URL'] ?? process.env['VALKEY_URL']
  if (!inherited) throw new Error('Real article-sync SDK tests require the worktree queue URL')
  const url = new URL(inherited)
  const namespace = BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`).toString()
  url.pathname = `/${namespace}`
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  return { prefix: `voucha_qdb_${namespace}` }
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('editorial sync through the registered admin SDK', () => {
  it('starts an owned job and reads it through the merged editorial tool', async () => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUser({ administrator: true })
    const client = await connectSdkCatalog(sdkCatalogCases[3]!, admin, async (url, fetch) => {
      const sdk = new Client({ name: 'voucha-article-sync-catalog-test', version: '1.0.0' })
      await sdk.connect(new StreamableHTTPClientTransport(url, { fetch }))
      return sdk
    })
    try {
      const catalog = await createSdkCatalogAssertions(client)
      const started = await client.callTool({ name: 'start_article_sync', arguments: {} })
      expect(started.isError).toBeUndefined()
      const jobId = (started.structuredContent as { jobId: string }).jobId
      expect((await articleSync.getJob(jobId))?.data).toEqual({ userId: admin.id })
      expect(
        await catalog.callAndValidate('read_editorial_job', 'article_sync', {
          job_id: jobId,
        }),
      ).toBeDefined()
    } finally {
      await client.close()
      await articleSync.close()
    }
  })
})
