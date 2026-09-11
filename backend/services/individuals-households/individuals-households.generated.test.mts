import { createTestUser } from '@voucha/test-helpers'
import { it, expect, beforeAll, describe } from 'vitest'
import { getHouseholdByUser } from './individuals-households.mts'
import type { PrivateUser } from '@services/users/types'

describe('individuals-households.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('getHouseholdByUser creates individual and household on first access', async () => {
    const result = await getHouseholdByUser(user)

    expect(result).toBeDefined()
    expect(result.individual).toBeDefined()
    expect(result.household).toBeDefined()
    expect(result.household.owner_id).toBe(user.id)
  })

  it('getHouseholdByUser returns existing individual and household', async () => {
    // First call creates
    const result1 = await getHouseholdByUser(user)
    // Second call should return existing
    const result2 = await getHouseholdByUser(user)

    expect(result2.individual.id).toBe(result1.individual.id)
    expect(result2.household.id).toBe(result1.household.id)
  })
})
