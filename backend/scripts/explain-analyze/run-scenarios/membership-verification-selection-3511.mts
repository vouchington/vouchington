import { findRecoverableMembershipVerificationIds } from '@services/memberships/verification-recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipVerificationSelection3511Scenario(): Promise<void> {
  registerScenarioContract('membership-verification-recovery-due', {
    seededRows: { membership_verification_processing_work_items: 10000 },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_membership_verification_processing_work_items__claim'],
      },
      {
        kind: 'maxProcessedRows',
        relation: 'membership_verification_processing_work_items',
        max: 200,
      },
    ],
  })
  await runAndCapture('membership-verification-recovery-due', async () => {
    const ids = await findRecoverableMembershipVerificationIds()
    if (ids.length !== 100) throw new Error('Expected 100 pending membership verifications')
  })
}
