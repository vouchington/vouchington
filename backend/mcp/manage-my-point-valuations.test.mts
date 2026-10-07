import { beforeAll, describe, expect, it } from 'vitest'
import manageMyPointValuationsTool from './manage-my-point-valuations.mts'
import getMyPointValuationsTool from './get-my-point-valuations.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestRewardsProgram } from '@voucha/test-helpers/entities/rewards-programs'
import type { PrivateUser } from '@services/users/types'
import type { IndividualRewardsProgramPointValuationPage } from '@services/individuals-households'
import { MAX_POINT_VALUE_MICROUNITS } from '@ts-shared/money'

describe('manage_my_point_valuations tool — real DB', () => {
  let user: PrivateUser
  let rewardsProgramId: string

  beforeAll(async () => {
    user = await createTestUser()
    rewardsProgramId = await insertTestRewardsProgram({ createdById: user.id })
  })

  it('bounds nested point-value amounts in the tool schema', () => {
    const properties = manageMyPointValuationsTool.schema.parameters?.properties as Record<
      string,
      { properties?: Record<string, { const?: number; maximum?: number }> }
    >
    const valuePerPoint = properties.value_per_point

    expect(valuePerPoint.properties?.amount).toMatchObject({
      type: 'integer',
      minimum: 0,
      maximum: MAX_POINT_VALUE_MICROUNITS,
    })
    expect(valuePerPoint.properties?.scale).toEqual({ type: 'integer', const: 6 })
    expect(MAX_POINT_VALUE_MICROUNITS).toBeLessThanOrEqual(
      valuePerPoint.properties?.amount.maximum ?? -1,
    )
    expect(MAX_POINT_VALUE_MICROUNITS + 1).toBeGreaterThan(
      valuePerPoint.properties?.amount.maximum ?? Number.MAX_SAFE_INTEGER,
    )
  })

  it('list returns empty initially', async () => {
    const freshUser = await createTestUser()
    const result = await getMyPointValuationsTool.function(freshUser)({})
    expect(result.success).toBe(true)
    const page = result.result as IndividualRewardsProgramPointValuationPage
    expect(page.results).toEqual([])
    expect(page.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('add creates a valuation', async () => {
    const execute = manageMyPointValuationsTool.function(user)
    const result = await execute({
      action: 'add',
      rewards_program_id: rewardsProgramId,
      value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
      note: 'initial valuation',
    })
    expect(result.success).toBe(true)
    expect(result.result).toHaveProperty('id')
    expect(result.result).toMatchObject({
      value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
    })
  })

  it('list after add returns the valuation', async () => {
    const result = await getMyPointValuationsTool.function(user)({})
    expect(result.success).toBe(true)
    const page = result.result as IndividualRewardsProgramPointValuationPage
    expect(page.results.some(v => v.rewards_program_id === rewardsProgramId)).toBe(true)
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('update modifies fields', async () => {
    const freshUser = await createTestUser()
    const rpId = await insertTestRewardsProgram({ createdById: freshUser.id })
    const addExecute = manageMyPointValuationsTool.function(freshUser)
    const added = (
      await addExecute({
        action: 'add',
        rewards_program_id: rpId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      })
    ).result as { id: string }

    const execute = manageMyPointValuationsTool.function(freshUser)
    const result = await execute({
      action: 'update',
      id: added.id,
      value_per_point: { amount: 20_000, currency: 'jpy', scale: 6 },
      note: 'updated',
    })
    expect(result.success).toBe(true)
    expect(result.result).toMatchObject({
      value_per_point: { amount: 20_000, currency: 'jpy', scale: 6 },
    })
    expect((result.result as { note: string }).note).toBe('updated')
  })

  it('enforces the point-value maximum through add and update operations', async () => {
    const execute = manageMyPointValuationsTool.function(user)
    const maximumProgramId = await insertTestRewardsProgram({ createdById: user.id })
    const added = await execute({
      action: 'add',
      rewards_program_id: maximumProgramId,
      value_per_point: {
        amount: MAX_POINT_VALUE_MICROUNITS,
        currency: 'usd',
        scale: 6,
      },
    })
    const id = (added.result as { id: string }).id

    await expect(
      execute({
        action: 'update',
        id,
        value_per_point: {
          amount: MAX_POINT_VALUE_MICROUNITS + 1,
          currency: 'usd',
          scale: 6,
        },
      }),
    ).rejects.toMatchObject({ status: 422 })

    const updateProgramId = await insertTestRewardsProgram({ createdById: user.id })
    const updateTarget = await execute({
      action: 'add',
      rewards_program_id: updateProgramId,
      value_per_point: { amount: 1, currency: 'usd', scale: 6 },
    })
    const updateId = (updateTarget.result as { id: string }).id
    const updated = await execute({
      action: 'update',
      id: updateId,
      value_per_point: {
        amount: MAX_POINT_VALUE_MICROUNITS,
        currency: 'jpy',
        scale: 6,
      },
    })
    expect(updated.result).toMatchObject({
      value_per_point: {
        amount: MAX_POINT_VALUE_MICROUNITS,
        currency: 'jpy',
        scale: 6,
      },
    })
  })

  it('remove deletes the valuation', async () => {
    const freshUser = await createTestUser()
    const rpId = await insertTestRewardsProgram({ createdById: freshUser.id })
    const addExecute = manageMyPointValuationsTool.function(freshUser)
    const added = (
      await addExecute({
        action: 'add',
        rewards_program_id: rpId,
        value_per_point: { amount: 5_000, currency: 'usd', scale: 6 },
      })
    ).result as { id: string }

    const execute = manageMyPointValuationsTool.function(freshUser)
    const result = await execute({ action: 'remove', id: added.id })
    expect(result.success).toBe(true)
    expect((result.result as { id: string }).id).toBe(added.id)
  })
})
