import { write } from '@data-stores/psql'
import { renewContributionAdmissionLease } from './admission-lease-renewal.mts'

/** Renews background work through the shared write pool. Transaction fences pass their own query. */
export async function renewContributionAdmissionLeaseFromWritePool(
  reservationId: string,
  leaseId: string,
): Promise<boolean> {
  return (await renewContributionAdmissionLease(write, reservationId, leaseId)) !== null
}
