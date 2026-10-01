import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestRewardsProgram } from '@voucha/test-helpers'
import {
  createIndividualRewardsProgramPointValuation,
  getIndividualRewardsProgramPointValuations,
} from './rewards-program-point-valuations.mts'

describe('rewards program point valuation database failures', () => {
  it('preserves an unexpected database error without creating a partial valuation', async () => {
    const user = await createTestUser()
    const programId = await insertTestRewardsProgram({ createdById: user.id })

    await expect(
      createIndividualRewardsProgramPointValuation(user, user, programId, {
        value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
        note: 'Invalid\u0000note',
      }),
    ).rejects.toMatchObject({ code: '22021' })
    expect((await getIndividualRewardsProgramPointValuations(user, user)).results).toEqual([])

    const valuation = await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
      note: 'Valid note',
    })
    expect((await getIndividualRewardsProgramPointValuations(user, user)).results).toEqual([
      valuation,
    ])
  })
})
