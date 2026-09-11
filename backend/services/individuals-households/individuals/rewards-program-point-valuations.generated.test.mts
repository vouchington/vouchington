import { createTestUser, insertTestRewardsProgram } from '@voucha/test-helpers'
import { it, expect, beforeAll, describe } from 'vitest'
import {
  getIndividualRewardsProgramPointValuations,
  createIndividualRewardsProgramPointValuation,
  updateIndividualRewardsProgramPointValuationById,
  deleteIndividualRewardsProgramPointValuationById,
  isDuplicatePointValuationConstraint,
} from './rewards-program-point-valuations.mts'
import type { PrivateUser } from '@services/users/types'
import { MAX_POINT_VALUE_MICROUNITS } from '@ts-shared/money'

describe('rewards-program-point-valuations.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it.each([
    ['uq_ind_rp_point_valuations__individual_rewards_program', true],
    ['uq_individual_rewards_program_point_valuations__individual_rewa', true],
    ['uq_individual_rewards_program_point_valuations__individual_rewards', false],
    [undefined, false],
  ])('isDuplicatePointValuationConstraint - maps %s to %s', (constraint, expected) => {
    expect(isDuplicatePointValuationConstraint(constraint)).toBe(expected)
  })

  it('createIndividualRewardsProgramPointValuation - returns enriched row with rewards_program', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const valuation = await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 35_000, currency: 'usd', scale: 6 },
    })

    expect(valuation).toBeDefined()
    expect(valuation.rewards_program_id).toBe(programId)
    expect(valuation.value_per_point).toEqual({ amount: 35_000, currency: 'usd', scale: 6 })
    expect(valuation.rewards_program).toBeDefined()
    expect(valuation.rewards_program.id).toBe(programId)
  })

  it('createIndividualRewardsProgramPointValuation - rejects duplicate rewards program valuation', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
    })

    await expect(
      createIndividualRewardsProgramPointValuation(user, user, programId, {
        value_per_point: { amount: 25_000, currency: 'usd', scale: 6 },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'You already have a valuation for this rewards program',
    })
  })

  it('createIndividualRewardsProgramPointValuation - requires authentication', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    await expect(
      createIndividualRewardsProgramPointValuation(null, user, programId, {
        value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
      }),
    ).rejects.toThrow(Error)
  })

  it('createIndividualRewardsProgramPointValuation - validates value_per_point', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    await expect(
      createIndividualRewardsProgramPointValuation(user, user, programId, {
        value_per_point: { amount: Number.NaN, currency: 'usd', scale: 6 },
      }),
    ).rejects.toThrow(Error)
  })

  it('getIndividualRewardsProgramPointValuations - returns all valuations', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const created = await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
    })
    const valuations = await getIndividualRewardsProgramPointValuations(user, user)

    expect(valuations).toBeDefined()
    expect(valuations.results.length).toBeGreaterThan(0)
    expect(valuations.results.some(v => v.id === created.id)).toBe(true)
  })

  it('updateIndividualRewardsProgramPointValuationById - returns enriched row', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const created = await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
    })
    const updated = await updateIndividualRewardsProgramPointValuationById(user, user, created.id, {
      value_per_point: { amount: 25_000, currency: 'usd', scale: 6 },
      note: 'Updated note',
    })

    expect(updated).toBeDefined()
    expect(updated.value_per_point).toEqual({ amount: 25_000, currency: 'usd', scale: 6 })
    expect(updated.note).toBe('Updated note')
    expect(updated.rewards_program).toBeDefined()
    expect(updated.rewards_program.id).toBe(programId)
  })

  it('updateIndividualRewardsProgramPointValuationById - throws 404 for unknown id', async () => {
    await expect(
      updateIndividualRewardsProgramPointValuationById(
        user,
        user,
        '00000000-0000-7000-8000-000000000000',
        { value_per_point: { amount: 10_000, currency: 'usd', scale: 6 } },
      ),
    ).rejects.toThrow(Error)
  })

  it('deleteIndividualRewardsProgramPointValuationById - deletes valuation', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const created = await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
    })
    await deleteIndividualRewardsProgramPointValuationById(user, user, created.id)

    const valuations = await getIndividualRewardsProgramPointValuations(user, user)
    expect(valuations.results.some(v => v.id === created.id)).toBe(false)
  })

  it('deleteIndividualRewardsProgramPointValuationById - throws 404 for unknown id', async () => {
    await expect(
      deleteIndividualRewardsProgramPointValuationById(
        user,
        user,
        '00000000-0000-7000-8000-000000000000',
      ),
    ).rejects.toThrow(Error)
  })

  it('createIndividualRewardsProgramPointValuation - throws 422 for negative value_per_point', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    await expect(
      createIndividualRewardsProgramPointValuation(user, user, programId, {
        value_per_point: { amount: -1, currency: 'usd', scale: 6 },
      }),
    ).rejects.toThrow(Error)
  })

  it('createIndividualRewardsProgramPointValuation - throws 422 for invalid rewards_program_id', async () => {
    await expect(
      createIndividualRewardsProgramPointValuation(
        user,
        user,
        '00000000-0000-7000-8000-000000000001',
        {
          value_per_point: { amount: 10_000, currency: 'usd', scale: 6 },
        },
      ),
    ).rejects.toThrow(Error)
  })

  it('updateIndividualRewardsProgramPointValuationById - updates only note', async () => {
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const created = await createIndividualRewardsProgramPointValuation(user, user, programId, {
      value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
    })
    const updated = await updateIndividualRewardsProgramPointValuationById(user, user, created.id, {
      note: 'note only update',
    })

    expect(updated.note).toBe('note only update')
    expect(updated.value_per_point).toEqual({ amount: 15_000, currency: 'usd', scale: 6 })
  })

  it('accepts the maximum point valuation and rejects the next microunit', async () => {
    const maximumProgramId = await insertTestRewardsProgram({ createdById: user.id })
    const maximum = await createIndividualRewardsProgramPointValuation(
      user,
      user,
      maximumProgramId,
      {
        value_per_point: {
          amount: MAX_POINT_VALUE_MICROUNITS,
          currency: 'usd',
          scale: 6,
        },
      },
    )
    expect(maximum.value_per_point.amount).toBe(MAX_POINT_VALUE_MICROUNITS)

    const excessiveProgramId = await insertTestRewardsProgram({ createdById: user.id })
    await expect(
      createIndividualRewardsProgramPointValuation(user, user, excessiveProgramId, {
        value_per_point: {
          amount: MAX_POINT_VALUE_MICROUNITS + 1,
          currency: 'usd',
          scale: 6,
        },
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})
