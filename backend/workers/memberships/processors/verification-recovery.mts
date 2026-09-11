import { enqueueBulkProcessMembershipVerifications } from '@queues/memberships/enqueues'
import { findRecoverableMembershipVerificationIds } from '@services/memberships'

export type RecoverMembershipVerificationsDependencies = {
  findRecoverableMembershipVerificationIds: typeof findRecoverableMembershipVerificationIds
  enqueueBulkProcessMembershipVerifications: typeof enqueueBulkProcessMembershipVerifications
}

const dependencies: RecoverMembershipVerificationsDependencies = {
  findRecoverableMembershipVerificationIds,
  enqueueBulkProcessMembershipVerifications,
}

export async function recoverMembershipVerifications(
  overrides: RecoverMembershipVerificationsDependencies = dependencies,
): Promise<{ enqueued: number }> {
  const verificationIds = await overrides.findRecoverableMembershipVerificationIds()
  if (verificationIds.length === 0) return { enqueued: 0 }
  await overrides.enqueueBulkProcessMembershipVerifications(
    verificationIds.map(verificationId => ({ verificationId })),
  )
  return { enqueued: verificationIds.length }
}
