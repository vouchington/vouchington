import type { PrivateUser } from '@services/users/types'
import { getOrCreateIndividual } from './individuals/individuals.mts'
import { getOrCreateHousehold } from './households/households.mts'

/**
 * Convenience function to get or create both individual and household for current user
 * This is a wrapper around getOrCreateIndividual and getOrCreateHousehold
 */
export async function getHouseholdByUser(currentUser: PrivateUser | null) {
  const individual = await getOrCreateIndividual(currentUser)
  const household = await getOrCreateHousehold(currentUser)
  return { individual, household }
}
