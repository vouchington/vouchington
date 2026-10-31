import { write } from '@data-stores/psql'
import {
  seedActiveProviderSourceRows,
  seedProviderRecoveryNotifications,
  seedMembershipVerificationRecovery,
  seedMicrosoftRecoveryCredentials,
  seedGoogleAcknowledgmentRecovery,
} from '../seed-data/membership-provider-notifications.mts'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { findRecoverableGooglePlayNotificationJobs } from '@services/memberships/google/notification-recovery'
import { findRecoverableGooglePlayActiveSourceJobs } from '@services/memberships/google/active-source-recovery'
import { findDueGooglePlayAcknowledgementIds } from '@services/memberships/google/acknowledgement-recovery'
import { findRecoverableMicrosoftStoreSourceJobs } from '@services/memberships/microsoft/source-recovery'
import {
  findMembershipVerificationRecoveryUpperBound,
  findRecoverableMembershipVerificationIds,
} from '@services/memberships/verification-recovery'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function runMembershipProviderRecoveryScenarios(): Promise<void> {
  const { googleId } = await seedProviderRecoveryNotifications()

  registerScenarioContract('membership-apple-notification-recovery', {
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
  })
  await runAndCapture(
    'membership-apple-notification-recovery',
    findRecoverableAppleNotificationJobs,
    undefined,
    'findRecoverableAppleNotificationJobs',
  )
  registerScenarioContract('membership-google-notification-recovery', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_membership_provider_evidence_records__pending_id'],
        queryContains: 'findGooglePlayNotificationSweepUpperBound',
      },
      { kind: 'maxProcessedRows', relation: 'membership_provider_evidence_records', max: 5_000 },
    ],
    seededRows: {
      membership_provider_evidence_records: 27_500,
      membership_provider_lineages: 3_500,
      membership_provider_contexts: 1_000,
    },
  })
  await runAndCapture(
    'membership-google-notification-recovery',
    findRecoverableGooglePlayNotificationJobs,
    undefined,
    ['findGooglePlayNotificationSweepUpperBound', 'findRecoverableGooglePlayNotificationJobs'],
  )
  await seedMembershipVerificationRecovery(googleId)
  registerScenarioContract('membership-verification-recovery-upper', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_verifications__pending'] },
      { kind: 'maxProcessedRows', relation: 'membership_verifications', max: 2 },
    ],
    seededRows: { membership_verifications: 100 },
  })
  await runAndCapture(
    'membership-verification-recovery-upper',
    findMembershipVerificationRecoveryUpperBound,
    undefined,
    'findMembershipVerificationRecoveryUpperBound',
  )
  registerScenarioContract('membership-verification-recovery-page', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'membership_verifications', max: 100 }],
    seededRows: { membership_verifications: 100 },
  })
  await runAndCapture(
    'membership-verification-recovery-page',
    () =>
      findRecoverableMembershipVerificationIds({
        through: '019e0000-ac00-7000-8000-999999999999',
        limit: 25,
      }),
    undefined,
    'findRecoverableMembershipVerificationIds',
  )

  const { rows: products } = await write<{ id: string }>(
    `/* seedExplainProviderRecovery:product */ SELECT id FROM membership_products ORDER BY id LIMIT 1`,
  )
  const productId = products[0]?.id
  if (!productId) throw new Error('Provider recovery EXPLAIN needs a seeded membership product')
  await seedActiveProviderSourceRows(googleId, productId, 'b2', 'b4', 12_000)
  const { rows: microsoftContexts } = await write<{ id: string }>(
    `/* seedExplainProviderRecovery:microsoftContext */ SELECT
       fn_upsert_membership_provider_context_id('microsoft_store', 'production',
         'explain-microsoft-recovery') AS id`,
  )
  const microsoftId = microsoftContexts[0]!.id
  await seedActiveProviderSourceRows(microsoftId, productId, 'b3', 'b5', 13_000)
  await write(
    `/* seedExplainProviderRecovery:googleTokens */
     INSERT INTO membership_google_play_purchase_tokens
       (id, membership_provider_context_id, purchase_token_lookup_sha256,
        encrypted_purchase_token, membership_provider_lineage_id, fetched_at)
     SELECT format('019e0000-b600-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid, encode(sha256(('explain-google-token-' || n)::bytea), 'hex'),
       '\\x01'::bytea,
       format('019e0000-b200-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       NOW()
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [googleId],
  )
  await seedMicrosoftRecoveryCredentials(microsoftId)
  await write(`/* seedExplainProviderRecovery:sourceStats */ ANALYZE membership_sources`)
  await write(`/* seedExplainProviderRecovery:contextStats */
    ANALYZE membership_provider_contexts, membership_provider_lineages`)
  await write(`/* seedExplainProviderRecovery:stateStats */ ANALYZE membership_source_states`)
  await write(
    `/* seedExplainProviderRecovery:tokenStats */ ANALYZE membership_google_play_purchase_tokens`,
  )
  await write(
    `/* seedExplainProviderRecovery:credentialStats */ ANALYZE membership_microsoft_store_credentials`,
  )
  await seedGoogleAcknowledgmentRecovery(googleId)
  registerScenarioContract('membership-google-active-source-recovery', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'membership_sources', max: 3_000 },
      { kind: 'maxProcessedRows', relation: 'membership_google_play_purchase_tokens', max: 20_100 },
    ],
    seededRows: {
      membership_sources: 3_500,
      membership_source_states: 3_500,
      membership_provider_lineages: 3_500,
      membership_provider_contexts: 1_000,
      membership_google_play_purchase_tokens: 100,
    },
  })
  await runAndCapture(
    'membership-google-active-source-recovery',
    findRecoverableGooglePlayActiveSourceJobs,
    undefined,
    [
      'findGooglePlayActiveSourceSweepUpperBound',
      'findGooglePlayActiveSourceRecoveryBatch.sources',
    ],
  )
  registerScenarioContract('membership-microsoft-source-recovery', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_membership_sources__user_id'] },
      { kind: 'maxProcessedRows', relation: 'membership_sources', max: 125 },
    ],
    seededRows: {
      membership_sources: 3_500,
      membership_source_states: 3_500,
      membership_provider_lineages: 3_500,
      membership_provider_contexts: 1_000,
      membership_microsoft_store_credentials: 100,
    },
  })
  await runAndCapture(
    'membership-microsoft-source-recovery',
    findRecoverableMicrosoftStoreSourceJobs,
    undefined,
    [
      'findMicrosoftStoreSourceRecoverySweepUpperBound',
      'findRecoverableMicrosoftStoreSourceJobs.sources',
    ],
  )
  registerScenarioContract('membership-google-acknowledgement-recovery', {
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'membership_google_play_acknowledgment_work_items',
        max: 100,
      },
    ],
    seededRows: { membership_google_play_acknowledgment_work_items: 100 },
  })
  await runAndCapture(
    'membership-google-acknowledgement-recovery',
    findDueGooglePlayAcknowledgementIds,
    undefined,
    ['findGooglePlayAcknowledgementSweepUpperBound', 'findDueGooglePlayAcknowledgementIds'],
  )
}
