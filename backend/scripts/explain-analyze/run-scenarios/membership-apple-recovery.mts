import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runAppleNotificationRecoveryScenarios(): Promise<void> {
  const contract: Parameters<typeof registerScenarioContract>[1] = {
    expectations: [
      { kind: 'custom', name: 'appleNotificationRecovery' },
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_membership_provider_evidence_records__pending_received_at',
          'idx_membership_provider_evidence_records__pending_id',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'membership_provider_evidence_records', max: 4_100 },
      { kind: 'maxProcessedRows', relation: 'membership_provider_lineages', max: 2_700 },
    ],
    seededRows: {
      membership_provider_evidence_records: 27_500,
      membership_provider_lineages: 3_500,
      membership_provider_contexts: 1_000,
    },
  }
  const { nextCursor: after, through } = await findRecoverableAppleNotificationJobs()
  if (!after || !through) throw new Error('Apple recovery fixture must span raw evidence pages')
  registerScenarioContract('membership-apple-notification-recovery', contract)
  await runAndCapture(
    'membership-apple-notification-recovery',
    findRecoverableAppleNotificationJobs,
    undefined,
    ['findAppleNotificationRecoveryUpperBound', 'findRecoverableAppleNotificationJobs'],
  )
  registerScenarioContract('membership-apple-notification-recovery-continuation', contract)
  await runAndCapture(
    'membership-apple-notification-recovery-continuation',
    () => findRecoverableAppleNotificationJobs({ after, through }),
    undefined,
    'findRecoverableAppleNotificationJobs',
  )
}
