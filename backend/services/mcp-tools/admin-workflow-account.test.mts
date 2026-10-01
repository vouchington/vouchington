import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { readAdminWorkflowVoteWeight } from '@voucha/test-helpers/admin-workflow-fixtures'
import { getPrivateUserByAny } from '@services/users'
import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const invoke = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['account-enforcement:read', 'account-enforcement:suspend', 'account-enforcement:vote-weight'],
    ADMIN_MCP_SERVER_CONFIG,
  )
function error(result: Awaited<ReturnType<typeof invoke>>, status: number) {
  expect(result.isError).toBe(true)
  const block = result.content[0]!
  if (block.type !== 'text') throw new Error('Expected typed error')
  expect(JSON.parse(block.text)).toMatchObject({ error: { status, retryable: false } })
}

describe('registered account recovery and vote weight tools', () => {
  it('unsuspends an account with attributed history and refuses an already active account', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    expect((await invoke(admin, 'suspend_user', { userId: target.id })).isError).not.toBe(true)
    expect((await invoke(admin, 'unsuspend_user', { userId: target.id })).isError).not.toBe(true)
    expect((await getPrivateUserByAny(target.id))?.suspended_at).toBeNull()
    const history = await readStaffActionHistory(admin.id)
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_type: 'unsuspend', target_user_id: target.id }),
      ]),
    )
    error(await invoke(admin, 'unsuspend_user', { userId: target.id }), 409)
    expect(await readStaffActionHistory(admin.id)).toEqual(history)
  })

  it('sets and clears an owned vote weight override with history', async () => {
    const admin = await createTestUser({ administrator: true })
    const target = await createTestUser()
    expect(
      (await invoke(admin, 'set_user_vote_weight', { userId: target.id, weight: 7 })).isError,
    ).not.toBe(true)
    expect(await readAdminWorkflowVoteWeight(target.id)).toMatchObject({
      vote_weight: 7,
      vote_weight_admin_set_at: expect.any(Date),
    })
    expect((await invoke(admin, 'clear_user_vote_weight', { userId: target.id })).isError).not.toBe(
      true,
    )
    expect(await readAdminWorkflowVoteWeight(target.id)).toMatchObject({
      vote_weight_admin_set_at: null,
    })
    expect(await readStaffActionHistory(admin.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_type: 'vote_weight_set', target_user_id: target.id }),
        expect.objectContaining({ action_type: 'vote_weight_reset', target_user_id: target.id }),
      ]),
    )
  })

  it.each(['set_user_vote_weight', 'clear_user_vote_weight'])(
    '%s rejects an unknown account without history',
    async name => {
      const admin = await createTestUser({ administrator: true })
      const userId = randomUUID()
      error(
        await invoke(
          admin,
          name,
          name === 'set_user_vote_weight' ? { userId, weight: 7 } : { userId },
        ),
        404,
      )
      expect(await readStaffActionHistory(admin.id)).toEqual([])
    },
  )
})
