import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import {
  getDynamicConfigNamespace,
  listDynamicConfigNamespaceHistory,
} from '@services/dynamic-config-admin'

describe('registered operations guard boundaries', () => {
  it('prevents the MCP config tool from enabling copyright decisions', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = { ...admin, membership_plan: null }
    const before = await getDynamicConfigNamespace(admin, 'copyright')
    const history = await listDynamicConfigNamespaceHistory(admin, 'copyright')
    const result = await callMcpTool(
      'update_dynamic_config_namespace',
      { namespace: 'copyright', config: { mcpDecisionTools: true } },
      user,
      ['site-operations:read', 'site-operations:config'],
      ADMIN_MCP_SERVER_CONFIG,
    )
    expect(result.isError).toBe(true)
    const block = result.content[0]!
    if (block.type !== 'text') throw new Error('Expected typed error')
    expect(JSON.parse(block.text)).toMatchObject({ error: { status: 403 } })
    expect(await getDynamicConfigNamespace(admin, 'copyright')).toEqual(before)
    expect(await listDynamicConfigNamespaceHistory(admin, 'copyright')).toEqual(history)
  })

  it.each([
    ['run_scheduled_job', 'site-operations:jobs'],
    ['run_backfill', 'site-operations:jobs'],
    ['update_dynamic_config_namespace', 'site-operations:config'],
  ] as const)('%s refuses an unknown target before history or dispatch', async (name, scope) => {
    const admin = await createTestUser({ administrator: true })
    const unknown = `admin-workflow-${randomUUID()}`
    const args =
      name === 'update_dynamic_config_namespace'
        ? { namespace: unknown, config: {} }
        : { id: unknown }
    const result = await callMcpTool(
      name,
      args,
      { ...admin, membership_plan: null },
      ['site-operations:read', scope],
      ADMIN_MCP_SERVER_CONFIG,
    )
    expect(result.isError).toBe(true)
    const block = result.content[0]!
    if (block.type !== 'text') throw new Error('Expected typed error')
    expect(JSON.parse(block.text)).toMatchObject({ error: { status: 404, retryable: false } })
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })

  it('rejects an invalid registered config field without changing its state or history', async () => {
    const admin = await createTestUser({ administrator: true })
    const namespace = 'route-rate-limit-config'
    const before = await getDynamicConfigNamespace(admin, namespace)
    expect(before).not.toBeNull()
    const history = await listDynamicConfigNamespaceHistory(admin, namespace)
    const result = await callMcpTool(
      'update_dynamic_config_namespace',
      {
        namespace,
        config: { [`unknown-${randomUUID()}`]: true },
      },
      { ...admin, membership_plan: null },
      ['site-operations:read', 'site-operations:config'],
      ADMIN_MCP_SERVER_CONFIG,
    )
    expect(result.isError).toBe(true)
    const block = result.content[0]!
    if (block.type !== 'text') throw new Error('Expected typed error')
    expect(JSON.parse(block.text)).toMatchObject({ error: { status: 400, retryable: false } })
    expect(await getDynamicConfigNamespace(admin, namespace)).toEqual(before)
    expect(await listDynamicConfigNamespaceHistory(admin, namespace)).toEqual(history)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })
})
