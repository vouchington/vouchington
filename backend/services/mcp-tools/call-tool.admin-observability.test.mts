import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'

describe('registered admin read projections', () => {
  it('projects actor-scoped audit search and moderation analytics without creating history', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    const invoke = (name: string, args: unknown) =>
      callMcpTool(
        name,
        args,
        { ...admin, membership_plan: null },
        ['moderation:read', 'moderation:write'],
        ADMIN_MCP_SERVER_CONFIG,
      )
    const note = await invoke('add_user_mod_note', {
      userId: target.id,
      body: `Audit fixture ${randomUUID()}`,
    })
    expect(note.isError).not.toBe(true)
    const history = await readStaffActionHistory(admin.id)
    const result = await invoke('search_moderator_actions', {
      actor_id: admin.id,
      action_type: 'warn',
      limit: 1,
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      results: [expect.objectContaining({ __entity_type: 'moderator_action', id: history[0]!.id })],
      moderator_actions: {
        [history[0]!.id]: expect.objectContaining({
          actor_id: admin.id,
          target_user_id: target.id,
        }),
      },
      users: { [admin.id]: expect.objectContaining({ id: admin.id }) },
    })
    for (const args of [{ range: 'today' }, {}]) {
      const analytics = await invoke('get_moderation_analytics', args)
      expect(analytics.isError).not.toBe(true)
      expect(analytics.structuredContent).toHaveProperty('moderator_workload.users')
    }
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })
})
