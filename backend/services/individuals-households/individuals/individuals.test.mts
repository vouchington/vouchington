import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { deleteTestIndividual } from '@voucha/test-helpers/entities/individuals'
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
})
