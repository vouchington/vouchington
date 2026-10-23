import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runAppleSelection3511Scenario(): Promise<void> {
  registerScenarioContract('apple-notification-recovery-due', {
    seededRows: {
      membership_provider_evidence_records: 10000,
      membership_provider_lineages: 10000,
      membership_provider_contexts: 1,
    },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_membership_provider_evidence_records__pending_notification'],
      },
      { kind: 'maxProcessedRows', relation: 'membership_provider_evidence_records', max: 200 },
    ],
  })
  await runAndCapture(
    'apple-notification-recovery-due',
    async () => {
      if ((await findRecoverableAppleNotificationJobs()).length !== 100)
        throw new Error('Expected 100 pending Apple notification records')
    },
    undefined,
    'findRecoverableAppleNotificationJobs',
  )
}
