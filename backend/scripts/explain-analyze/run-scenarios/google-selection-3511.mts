import {
  findNotificationSweepUpperBound,
  findPendingNotificationRows,
} from '@services/memberships/google/notification-recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { MEMBERSHIP_CONTEXT_NOISE_COUNT } from '../seed-data/membership-context-noise.mts'
import { runAndCapture } from '../run-support.mts'

export async function runGoogleSelection3511Scenarios(): Promise<void> {
  registerScenarioContract('google-notification-recovery-upper-bound', {
    seededRows: {
      membership_provider_evidence_records: 30000,
      membership_provider_contexts: MEMBERSHIP_CONTEXT_NOISE_COUNT + 4,
    },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_mbrshp_prvdr_evdnc_rcrds__google_pending_id'],
      },
      { kind: 'maxProcessedRows', relation: 'membership_provider_evidence_records', max: 300 },
    ],
  })
  await runAndCapture('google-notification-recovery-upper-bound', async () => {
    if (!(await findNotificationSweepUpperBound()))
      throw new Error('Expected pending Google notification evidence')
  })

  registerScenarioContract('google-notification-recovery-page', {
    seededRows: {
      membership_provider_evidence_records: 30000,
      membership_provider_contexts: MEMBERSHIP_CONTEXT_NOISE_COUNT + 4,
    },
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_mbrshp_prvdr_evdnc_rcrds__google_pending_id'],
      },
      { kind: 'maxProcessedRows', relation: 'membership_provider_evidence_records', max: 300 },
    ],
  })
  await runAndCapture('google-notification-recovery-page', async () => {
    const page = await findPendingNotificationRows(
      null,
      '019e0000-9a00-7000-8000-000000002710',
      100,
    )
    if (page.length !== 100) throw new Error('Expected 100 pending Google notifications')
  })
}
