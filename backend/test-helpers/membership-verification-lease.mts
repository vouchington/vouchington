import { workerQueueCommandClient } from '../data-stores/valkey-glide-mq/index.mts'
import { membershipVerificationLeaseNamespace } from '../queues/memberships/enqueues/verification-execution-lease.mts'

/** Removes held slots as expiry or a takeover would while a provider call is still running. */
export async function deleteMembershipVerificationLeaseSlots(slotCount: number): Promise<void> {
  await workerQueueCommandClient.unlink(
    Array.from(
      { length: slotCount },
      (_, slot) => `${membershipVerificationLeaseNamespace}:slot:${slot}`,
    ),
  )
}
