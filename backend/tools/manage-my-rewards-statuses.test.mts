import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import manageMyRewardsStatusesTool from './manage-my-rewards-statuses.mts'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { insertTestRewardsProgramStatus } from '@voucha/test-helpers/entities/rewards-program-statuses'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import type { PrivateUser } from '@services/users/types'

describe('manage_my_rewards_statuses tool — real DB', () => {
  let user: PrivateUser
  let rewardsProgramStatusId: string
  const suspendedUserIds: string[] = []

  beforeAll(async () => {
    user = await createTestUser()
    rewardsProgramStatusId = await insertTestRewardsProgramStatus({ createdById: user.id })
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('list returns empty initially', async () => {
    const freshUser = await createTestUser()
    const execute = manageMyRewardsStatusesTool.function(freshUser)
    const result = await execute({ action: 'list' })
    expect(result.success).toBe(true)
    expect(result.result).toMatchObject({ results: [], page_info: { has_next_page: false } })
  })

  it('add creates a status', async () => {
    const execute = manageMyRewardsStatusesTool.function(user)
    const result = await execute({
      action: 'add',
      rewards_program_status_id: rewardsProgramStatusId,
    })
    expect(result.success).toBe(true)
    expect(result.result).toHaveProperty('id')
    expect(
      (result.result as { rewards_program_status: { id: string } }).rewards_program_status.id,
    ).toBe(rewardsProgramStatusId)
  })

  it('list after add returns the status', async () => {
    const execute = manageMyRewardsStatusesTool.function(user)
    const result = await execute({ action: 'list' })
    expect(result.success).toBe(true)
    const statuses = result.result as { results: Array<{ rewards_program_status: { id: string } }> }
    expect(statuses.results.some(s => s.rewards_program_status.id === rewardsProgramStatusId)).toBe(
      true,
    )
  })

  it('forwards cursor pagination options', async () => {
    const execute = manageMyRewardsStatusesTool.function(user)
    const result = await execute({ action: 'list', limit: 1 })
    expect((result.result as { results: unknown[] }).results).toHaveLength(1)
  })

  it('update modifies fields', async () => {
    const freshUser = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: freshUser.id })
    const addExecute = manageMyRewardsStatusesTool.function(freshUser)
    const added = (await addExecute({ action: 'add', rewards_program_status_id: statusId }))
      .result as { id: string }

    const execute = manageMyRewardsStatusesTool.function(freshUser)
    const result = await execute({
      action: 'update',
      id: added.id,
      since: '2024-01-01',
      until: '2024-12-31',
    })
    expect(result.success).toBe(true)
    expect((result.result as { since: string }).since).toContain('2024-01-01')
    expect((result.result as { until: string }).until).toContain('2024-12-31')
  })

  it('remove deletes the status', async () => {
    const freshUser = await createTestUser()
    const statusId = await insertTestRewardsProgramStatus({ createdById: freshUser.id })
    const addExecute = manageMyRewardsStatusesTool.function(freshUser)
    const added = (await addExecute({ action: 'add', rewards_program_status_id: statusId }))
      .result as { id: string }

    const execute = manageMyRewardsStatusesTool.function(freshUser)
    const result = await execute({ action: 'remove', id: added.id })
    expect(result.success).toBe(true)
    expect((result.result as { id: string }).id).toBe(added.id)
  })

  it('allows a suspended user to list statuses', async () => {
    const suspendedUser = await createTestUser()
    await suspendForTest(suspendedUser.id)

    const result = await manageMyRewardsStatusesTool.function(suspendedUser)({ action: 'list' })

    expect(result).toMatchObject({ success: true, result: { results: [] } })
  })

  it.each(['add', 'update', 'remove'] as const)(
    'rejects suspended users from %s mutations without changing statuses',
    async action => {
      const suspendedUser = await createTestUser()
      const statusId = await insertTestRewardsProgramStatus({ createdById: suspendedUser.id })
      const add = manageMyRewardsStatusesTool.function(suspendedUser)
      const existing = (await add({ action: 'add', rewards_program_status_id: statusId }))
        .result as {
        id: string
      }
      await suspendForTest(suspendedUser.id)

      const execute = manageMyRewardsStatusesTool.function(suspendedUser)
      const mutation =
        action === 'add'
          ? execute({ action, rewards_program_status_id: statusId })
          : action === 'update'
            ? execute({ action, id: existing.id, since: '2026-01-01' })
            : execute({ action, id: existing.id })

      await expect(mutation).rejects.toMatchObject({ status: 403, code: ACCOUNT_SUSPENDED })
      const statuses = await execute({ action: 'list' })
      expect(
        (statuses.result as { results: Array<{ id: string }> }).results.some(
          status => status.id === existing.id,
        ),
      ).toBe(true)
    },
  )

  async function suspendForTest(userId: string): Promise<void> {
    await suspendTestUser(userId)
    suspendedUserIds.push(userId)
  }
})
