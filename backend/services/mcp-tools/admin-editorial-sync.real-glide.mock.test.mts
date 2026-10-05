import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { articleSync } from '@queues/article-sync/queues'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const { prefix } = vi.hoisted(() => {
  const inherited = process.env['VALKEY_WORKER_QUEUE_URL'] ?? process.env['VALKEY_URL']
  if (!inherited) throw new Error('Real article-sync tests require the worktree queue URL')
  const url = new URL(inherited)
  const namespace = BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`).toString()
  url.pathname = `/${namespace}`
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  return { prefix: `voucha_qdb_${namespace}` }
})
// Select the real GlideMQ project; retain the actual provider rather than its default shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('registered article sync on an owned real queue namespace', () => {
  it('starts a real identifier-only job, records history and rejects its throttled repeat', async () => {
    // Fail rather than touch a shared singleton if setup imported queue configuration too early.
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUser({ administrator: true })
    const invoke = () =>
      callMcpTool(
        'start_article_sync',
        {},
        { ...admin, membership_plan: null },
        ['editorial:read', 'editorial:write'],
        ADMIN_MCP_SERVER_CONFIG,
      )
    try {
      const result = await invoke()
      expect(result.isError).not.toBe(true)
      const jobId = result.structuredContent!['jobId'] as string
      const job = await articleSync.getJob(jobId)
      expect(job?.data).toEqual({ userId: admin.id })
      const history = await readStaffActionHistory(admin.id)
      expect(history).toEqual([
        expect.objectContaining({
          action_type: 'article_sync_run',
          metadata: expect.objectContaining({ phase: 'requested' }),
        }),
        expect.objectContaining({
          action_type: 'article_sync_run',
          operation_request_action_id: history[0]?.id,
          metadata: expect.objectContaining({ phase: 'finished', outcome: 'succeeded' }),
        }),
      ])
      const repeated = await invoke()
      expect(repeated.isError).toBe(true)
      const content = repeated.content[0]!
      expect(content.type).toBe('text')
      if (content.type !== 'text') throw new Error('Expected typed domain error')
      expect(JSON.parse(content.text)).toMatchObject({ error: { status: 409, retryable: false } })
      const after = await readStaffActionHistory(admin.id)
      expect(after).toHaveLength(4)
      expect(after.slice(0, 2)).toEqual(history)
      expect(after[3]).toMatchObject({
        operation_request_action_id: after[2]?.id,
        metadata: expect.objectContaining({ phase: 'finished', outcome: 'failed' }),
      })
      expect((await articleSync.getJob(jobId))?.data).toEqual({ userId: admin.id })
    } finally {
      await articleSync.close()
    }
  })
})
