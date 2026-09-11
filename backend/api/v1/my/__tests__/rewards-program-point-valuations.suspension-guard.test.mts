import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestRewardsProgram,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import {
  createIndividualRewardsProgramPointValuation,
  getIndividualRewardsProgramPointValuations,
} from '@services/individuals-households'

describe('point valuation suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('rejects create mutations from a suspended user', async () => {
    const user = await createTestUser()
    const rewardsProgramId = await insertTestRewardsProgram({ createdById: user.id })
    await suspendForTest(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/rewards-program-point-valuations')
      .send({
        rewards_program_id: rewardsProgramId,
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const page = await getIndividualRewardsProgramPointValuations(user, user)
    expect(page.results).toEqual([])
  })

  it('rejects update mutations from a suspended user', async () => {
    const user = await createTestUser()
    const rewardsProgramId = await insertTestRewardsProgram({ createdById: user.id })
    const valuation = await createIndividualRewardsProgramPointValuation(
      user,
      user,
      rewardsProgramId,
      { value_per_point: { amount: 10_000, currency: 'usd', scale: 6 } },
    )
    await suspendForTest(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .patch(`/api/v1/my/rewards-program-point-valuations/${valuation.id}`)
      .send({ value_per_point: { amount: 20_000, currency: 'usd', scale: 6 } })
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const page = await getIndividualRewardsProgramPointValuations(user, user)
    expect(page.results.find(value => value.id === valuation.id)?.value_per_point).toEqual({
      amount: 10_000,
      currency: 'usd',
      scale: 6,
    })
  })

  it('rejects delete mutations from a suspended user', async () => {
    const user = await createTestUser()
    const rewardsProgramId = await insertTestRewardsProgram({ createdById: user.id })
    const valuation = await createIndividualRewardsProgramPointValuation(
      user,
      user,
      rewardsProgramId,
      { value_per_point: { amount: 10_000, currency: 'usd', scale: 6 } },
    )
    await suspendForTest(user.id)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .delete(`/api/v1/my/rewards-program-point-valuations/${valuation.id}`)
      .expect(403)

    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    const page = await getIndividualRewardsProgramPointValuations(user, user)
    expect(page.results.some(value => value.id === valuation.id)).toBe(true)
  })

  async function suspendForTest(userId: string): Promise<void> {
    await suspendTestUser(userId)
    suspendedUserIds.push(userId)
  }
})
