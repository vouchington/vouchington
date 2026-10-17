import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { describe, expect, it, vi } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { getQueueDomainControl, resumeQueueDomain } from '@services/queue-domain-controls'
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
  it('controls one domain of the shared background queue through the same tools', async () => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUserDirect({ administrator: true })
    // Only enqueued here; the domain's provider worker is not running in the data-store project.
    const domain = 'kagi-smallweb'
    try {
      // `list_queues` is the `queues` option of the merged `read_queue_catalog` tool.
      const listed = await invoke(admin, 'read_queue_catalog', {
        option: 'queues',
        arguments: { domains_of: 'background' },
      })
      expect(listed.isError).not.toBe(true)
      expect(listed.structuredContent).toMatchObject({
        domains: expect.arrayContaining([expect.objectContaining({ domain, paused: false })]),
      })

      const args = { name: 'background', domain, reason: 'upstream outage' }
      expect((await invoke(admin, 'pause_queue', args)).isError).not.toBe(true)
      expect((await invoke(admin, 'pause_queue', args)).isError).not.toBe(true)
      await expect(getQueueDomainControl(domain)).resolves.toMatchObject({
        paused: true,
        pausedBy: admin.id,
        reason: 'upstream outage',
      })
      await expectOperation(admin.id, 'queue_pause')
      expect(
        (await invoke(admin, 'resume_queue', { name: 'background', domain })).isError,
      ).not.toBe(true)
      await expect(getQueueDomainControl(domain)).resolves.toMatchObject({ paused: false })
      expect(
        (await invoke(admin, 'retry_failed_queue_jobs', { name: 'background', domain })).isError,
      ).not.toBe(true)
    } finally {
      await resumeQueueDomain(domain)
    }
  })
  it('rejects a reason without a domain and a whole-queue pause of the background queue', async () => {
    expect(workerQueuePrefix).toBe(prefix)
    const admin = await createTestUserDirect({ administrator: true })
    expect(
      (await invoke(admin, 'pause_queue', { name: 'psql', reason: 'no domain' })).isError,
    ).toBe(true)
    expect((await invoke(admin, 'pause_queue', { name: 'background' })).isError).toBe(true)
    expect(
      (await invoke(admin, 'pause_queue', { name: 'background', domain: 'not-a-domain' })).isError,
    ).toBe(true)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
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
    ['scheduled', 'kagi-smallweb-sync', 'scheduled_job_run'],
    ['backfill', 'backfill_report_judgements', 'backfill_run'],
  ] as const)(
    'enqueues run_operational_job %s and records requested/finished history',
    async (option, id, action) => {
      expect(workerQueuePrefix).toBe(prefix)
      const admin = await createTestUserDirect({ administrator: true })
      expect(
        (await invoke(admin, 'run_operational_job', { option, arguments: { id } })).isError,
      ).not.toBe(true)
      await expectOperation(admin.id, action)
      const before = await readStaffActionHistory(admin.id)
      expect(
        (
          await invoke(admin, 'run_operational_job', {
            option,
            arguments: { id: `missing-${admin.id}` },
          })
        ).isError,
      ).toBe(true)
      expect(await readStaffActionHistory(admin.id)).toEqual(before)
    },
  )
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
