import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createStaffResolutionFixture,
  readStaffResolutionState,
} from '@voucha/test-helpers/staff-resolution-history'
import {
  readAdminWorkflowTraining,
  readAdminWorkflowLifecycle,
} from '@voucha/test-helpers/admin-workflow-fixtures'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const invoke = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['moderation:write', 'moderation:approve', 'moderation:ai-rerun'],
    ADMIN_MCP_SERVER_CONFIG,
  )
function error(result: Awaited<ReturnType<typeof invoke>>, status: number) {
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  if (block.type !== 'text') throw new Error('Expected typed error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

describe.each(['appeal', 'dispute'] as const)('registered %s workflows', kind => {
  const draft = `draft_${kind}_response`
  const approve = `approve_${kind}_response`
  const deliver = `deliver_${kind}_response`
  const resolve = kind === 'appeal' ? 'resolve_moderation_appeal' : 'resolve_review_dispute'
  const action = kind === 'appeal' ? 'deny' : 'dismiss'

  it('drafts, approves, delivers and resolves with attributed history and no agent training', async () => {
    const admin = await createTestUser({ administrator: true })
    const { id } = await createStaffResolutionFixture(kind, false)
    expect(
      (
        await invoke(admin, draft, {
          id,
          public_response: 'Reviewed response',
          internal_notes: 'Private review',
        })
      ).isError,
    ).not.toBe(true)
    expect((await invoke(admin, approve, { id })).isError).not.toBe(true)
    expect((await invoke(admin, deliver, { id })).isError).not.toBe(true)
    const lifecycle = await readAdminWorkflowLifecycle(kind, id)
    for (const change of ['edit', 'approve', 'send']) {
      expect(lifecycle).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ change_type: change, changed_by_id: admin.id }),
        ]),
      )
    }
    expect((await invoke(admin, resolve, { id, action })).isError).not.toBe(true)
    expect((await readStaffResolutionState(kind, id)).resolved_at).not.toBeNull()
    expect(await readStaffActionHistory(admin.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining(
          kind === 'appeal'
            ? { action_type: 'dismiss_appeal', moderation_appeal_id: id }
            : { action_type: 'dismiss_report', review_dispute_id: id },
        ),
      ]),
    )
    expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
  })

  it('rejects approval without a draft, delivery without approval and resolution without delivery with no effects', async () => {
    const admin = await createTestUser({ administrator: true })
    const { id } = await createStaffResolutionFixture(kind, false)
    const state = await readStaffResolutionState(kind, id)
    const lifecycle = await readAdminWorkflowLifecycle(kind, id)
    error(await invoke(admin, approve, { id }), 404)
    error(await invoke(admin, deliver, { id }), 422)
    error(await invoke(admin, resolve, { id, action }), 422)
    expect(await readStaffResolutionState(kind, id)).toEqual(state)
    expect(await readAdminWorkflowLifecycle(kind, id)).toEqual(lifecycle)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
    expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
  })

  it('refuses draft edits, approval, repeated delivery and AI reruns after delivery without effects', async () => {
    const admin = await createTestUser({ administrator: true })
    const { id } = await createStaffResolutionFixture(kind)
    const state = await readStaffResolutionState(kind, id)
    const lifecycle = await readAdminWorkflowLifecycle(kind, id)
    error(await invoke(admin, draft, { id, public_response: 'Replacement' }), 404)
    error(await invoke(admin, approve, { id }), 404)
    error(await invoke(admin, deliver, { id }), 422)
    error(await invoke(admin, `rerun_${kind}_resolution_draft`, { id }), 422)
    expect(await readStaffResolutionState(kind, id)).toEqual(state)
    expect(await readAdminWorkflowLifecycle(kind, id)).toEqual(lifecycle)
    expect(await readStaffActionHistory(admin.id)).toEqual([])
  })

  it('rejects repeated resolution without adding history or training', async () => {
    const admin = await createTestUser({ administrator: true })
    const { id } = await createStaffResolutionFixture(kind)
    expect((await invoke(admin, resolve, { id, action })).isError).not.toBe(true)
    const state = await readStaffResolutionState(kind, id)
    const history = await readStaffActionHistory(admin.id)
    error(await invoke(admin, resolve, { id, action }), 404)
    expect(await readStaffResolutionState(kind, id)).toEqual(state)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
    expect(await readAdminWorkflowTraining(admin.id)).toEqual([])
  })
})
