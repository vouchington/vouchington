import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteForeignKeyTargetDuringInsertForTest,
  insertTestRewardsProgram,
} from '@voucha/test-helpers'
import {
  createIndividualRewardsProgramPointValuation,
  getIndividualRewardsProgramPointValuations,
} from './rewards-program-point-valuations.mts'

describe('rewards program point valuation database failures', () => {
  it('returns not found when a rewards program is deleted during the insert FK check', async () => {
    const user = await createTestUser()
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createIndividualRewardsProgramPointValuation */',
      lockTarget: async query => {
        await query(
          '/* lockTestRewardsProgramTopic */ SELECT topic_id FROM rewards_program_topics WHERE topic_id = $1 FOR UPDATE',
          [programId],
        )
      },
      deleteTarget: async query => {
        await query(
          '/* deleteTestRewardsProgramTopic */ DELETE FROM rewards_program_topics WHERE topic_id = $1',
          [programId],
        )
      },
      operation: () =>
        createIndividualRewardsProgramPointValuation(user, user, programId, {
          value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
        }),
    })

    expect(outcome).toMatchObject({ error: { status: 404, message: 'Topic not found' } })
  })

  it('preserves the former validation response when the owner FK fails during insert', async () => {
    const user = await createTestUser()
    const programId = await insertTestRewardsProgram({ createdById: user.id })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createIndividualRewardsProgramPointValuation */',
      lockTarget: async query => {
        await query(
          '/* lockTestValuationOwner */ SELECT id FROM individuals WHERE id = $1 FOR UPDATE',
          [user.individual_id!],
        )
      },
      deleteTarget: async query => {
        await query('/* deleteTestValuationOwner */ DELETE FROM individuals WHERE id = $1', [
          user.individual_id!,
        ])
      },
      operation: () =>
        createIndividualRewardsProgramPointValuation(user, user, programId, {
          value_per_point: { amount: 15_000, currency: 'usd', scale: 6 },
        }),
    })

    expect(outcome).toMatchObject({
      error: { status: 422, message: 'Invalid rewards_program_id' },
    })
  })

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
