import { getElapsedMembershipUserIdsBatch } from '@services/memberships/grants/expire-elapsed-batch'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipExpirySelection3511Scenario(): Promise<void> {
  registerScenarioContract('membership-grant-expiry-due', {
    seededRows: { memberships: 10000, membership_sources: 10000 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_memberships__expires_at'] },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 200 },
    ],
  })
  await runAndCapture('membership-grant-expiry-due', async () => {
    const userIds = await getElapsedMembershipUserIdsBatch(10)
    if (userIds.length !== 10) throw new Error('Expected ten expired admin-grant memberships')
  })
}
