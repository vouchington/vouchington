import type { PrivateUser } from '@services/users/types'
import { getOrCreateIndividual } from './individuals/individuals.mts'
import { getOrCreateHousehold } from './households/households.mts'

/**
 * Convenience function to get or create both individual and household for current user
 * This is a wrapper around getOrCreateIndividual and getOrCreateHousehold
 *
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/individuals-households/README.md`.
 */
export async function getHouseholdByUser(currentUser: PrivateUser | null) {
  const individual = await getOrCreateIndividual(currentUser)
  const household = await getOrCreateHousehold(currentUser)
  return { individual, household }
}
