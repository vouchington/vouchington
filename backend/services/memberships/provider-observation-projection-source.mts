import type { QueryExecutor } from '@data-stores/psql'
import { createProviderMembershipSource } from './create-source.mts'
import { lockMembershipUser } from './lock-user.mts'
import type { VerifiedProviderObservation } from './provider-observation.mts'

export async function lockAndCreateProviderObservationSource(
  userId: string,
  observation: VerifiedProviderObservation,
  query: QueryExecutor,
) {
  await lockMembershipUser(userId, query)
  return createProviderMembershipSource(
    { userId, sourceKind: observation.sourceKind, sourceIdentity: observation.sourceIdentity },
    query,
  )
}
