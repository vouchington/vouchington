import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPrivateUserById,
  observeTestPostgresQueryPools,
} from '@voucha/test-helpers'
import {
  assignTestRepresentativeIndividual,
  createTestIndividual,
  deleteTestIndividual,
} from '@voucha/test-helpers/entities/individuals'
import { getOrCreateIndividual } from './individuals.mts'

describe('getOrCreateIndividual', () => {
  it('creates a replacement when the automatic individual row is gone', async () => {
    const user = await createTestUser()
    const individualId = user.individual_id
    expect(individualId).toEqual(expect.any(String))
    if (typeof individualId !== 'string') return
    await deleteTestIndividual(individualId)

    const created = await getOrCreateIndividual(user)
    expect(created?.id).toEqual(expect.any(String))
    expect(created?.id).not.toBe(user.individual_id)
  })

  it('creates an additional individual when a representative is assigned during lookup', async () => {
    const user = await createTestUser()
    const originalIndividualId = user.individual_id
    expect(originalIndividualId).toEqual(expect.any(String))
    if (typeof originalIndividualId !== 'string') return
    await deleteTestIndividual(originalIndividualId)

    const representative = await createTestIndividual()
    let assigned = false

    const { result } = await observeTestPostgresQueryPools(
      '/* getIndividual */',
      () => getOrCreateIndividual(user),
      async () => {
        if (assigned) return
        assigned = true
        await assignTestRepresentativeIndividual(user.id, representative.id)
      },
    )

    expect(assigned).toBe(true)
    expect(result).toEqual({ id: expect.any(String), updated_at: expect.any(Date) })
    expect(result.id).not.toBe(representative.id)
    const updatedUser = await getTestPrivateUserById(user.id)
    expect(updatedUser?.individual_id).toBe(representative.id)
  })
})
