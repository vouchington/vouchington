import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { describe, expect, it, vi } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { findQueueByName } from '@services/queue-monitoring/queue-inventory'
import {
  getDynamicConfigNamespace,
  listDynamicConfigNamespaceHistory,
} from '@services/dynamic-config-admin'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

const { prefix } = vi.hoisted(() => {
  const inherited = process.env['VALKEY_WORKER_QUEUE_URL'] ?? process.env['VALKEY_URL']
  if (!inherited) throw new Error('Real operational tests require the worktree queue URL')
  const url = new URL(inherited)
  const namespace = BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`).toString()
  url.pathname = `/${namespace}`
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
  return { prefix: `voucha_qdb_${namespace}` }
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const invoke = (
  admin: Awaited<ReturnType<typeof createTestUserDirect>>,
  name: string,
  args: unknown,
) =>
  callMcpTool(
    name,
    args,
    { ...admin, membership_plan: null },
    [
      'site-operations:read',
      'site-operations:queues',
      'site-operations:config',
      'site-operations:jobs',
    ],
    ADMIN_MCP_SERVER_CONFIG,
  )

async function expectOperation(actorId: string, action: string) {
  const rows = (await readStaffActionHistory(actorId)).filter(row => row.action_type === action)
  expect(rows).toHaveLength(2)
  expect(rows[0]?.metadata).toMatchObject({ phase: 'requested' })
  expect(rows[1]).toMatchObject({
    operation_request_action_id: rows[0]?.id,
    metadata: { phase: 'finished', outcome: 'succeeded' },
  })
}

describe('registered operational writes on disposable CI boundaries', () => {
  it('pauses/resumes a managed queue idempotently and audits bounded retry', async () => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUserDirect({ administrator: true })
    // The existing REST pause tests use psql. This managed queue is only enqueued here;
    // its provider worker is not running in the backend data-store test project.
    const queue = findQueueByName('kagi-smallweb')!
    const before = await queue.isPaused()
    await queue.resume()
    try {
      expect((await invoke(admin, 'pause_queue', { name: queue.name })).isError).not.toBe(true)
      expect(await queue.isPaused()).toBe(true)
      expect((await invoke(admin, 'pause_queue', { name: queue.name })).isError).not.toBe(true)
      await expectOperation(admin.id, 'queue_pause')
      expect((await invoke(admin, 'resume_queue', { name: queue.name })).isError).not.toBe(true)
      expect(await queue.isPaused()).toBe(false)
      expect((await invoke(admin, 'resume_queue', { name: queue.name })).isError).not.toBe(true)
      await expectOperation(admin.id, 'queue_resume')
      expect(
        (await invoke(admin, 'retry_failed_queue_jobs', { name: queue.name })).isError,
      ).not.toBe(true)
      await expectOperation(admin.id, 'queue_retry_failed')
    } finally {
      if (before) await queue.pause()
      else await queue.resume()
    }
  })
  it.each(['pause_queue', 'resume_queue', 'retry_failed_queue_jobs'])(
    'rejects %s on an unknown queue without history',
    async name => {
      expect(workerQueuePrefix).toBe(prefix)
      const admin = await createTestUserDirect({ administrator: true })
      expect((await invoke(admin, name, { name: `missing-${admin.id}` })).isError).toBe(true)
      expect(await readStaffActionHistory(admin.id)).toEqual([])
    },
  )
  it.each([
    ['run_scheduled_job', 'kagi-smallweb-sync', 'scheduled_job_run'],
    ['run_backfill', 'backfill_report_judgements', 'backfill_run'],
  ])('enqueues %s and records requested/finished history', async (name, id, action) => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUserDirect({ administrator: true })
    expect((await invoke(admin, name!, { id })).isError).not.toBe(true)
    await expectOperation(admin.id, action!)
    const before = await readStaffActionHistory(admin.id)
    expect((await invoke(admin, name!, { id: `missing-${admin.id}` })).isError).toBe(true)
    expect(await readStaffActionHistory(admin.id)).toEqual(before)
  })
  it('updates configuration with its own actor history, no-op semantics and validation guard', async () => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUserDirect({ administrator: true })
    const namespace = 'kagi-smallweb-config'
    const current = await getDynamicConfigNamespace(admin, namespace)
    expect(current).not.toBeNull()
    const previous = current!.config.enabled
    const next = !previous
    try {
      expect(
        (
          await invoke(admin, 'update_dynamic_config_namespace', {
            namespace,
            config: { enabled: next },
          })
        ).isError,
      ).not.toBe(true)
      expect((await getDynamicConfigNamespace(admin, namespace))?.config.enabled).toBe(next)
      const history = (await listDynamicConfigNamespaceHistory(admin, namespace))!.filter(
        row => row.changed_by?.id === admin.id,
      )
      expect(history).toHaveLength(1)
      expect(history[0]).toMatchObject({
        previous_fields: { enabled: previous },
        next_fields: { enabled: next },
      })
      expect(
        (
          await invoke(admin, 'update_dynamic_config_namespace', {
            namespace,
            config: { enabled: next },
          })
        ).isError,
      ).not.toBe(true)
      expect(
        (
          await invoke(admin, 'update_dynamic_config_namespace', {
            namespace,
            config: { enabled: 'invalid' },
          })
        ).isError,
      ).toBe(true)
      expect(
        (await listDynamicConfigNamespaceHistory(admin, namespace))!.filter(
          row => row.changed_by?.id === admin.id,
        ),
      ).toEqual(history)
    } finally {
      await invoke(admin, 'update_dynamic_config_namespace', {
        namespace,
        config: { enabled: previous },
      })
    }
  })
})
