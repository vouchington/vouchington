import { createHash, randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { acceptObservation } from '../services/memberships/google/verification-persistence.mts'
import type { Context } from '../services/memberships/google/process-verification.mts'
import type { GooglePlayMembershipObservation } from '../services/memberships/google/types.mts'

export async function getTestGooglePlayAcknowledgementId(
  verificationId: string,
): Promise<string | null> {
  const { rows } = await write<{ id: string }>(sql`
    /* getTestGooglePlayAcknowledgementId */
    SELECT acknowledgement.id
    FROM membership_google_play_acknowledgements acknowledgement
    INNER JOIN membership_verifications verification
      ON verification.membership_provider_evidence_id = acknowledgement.membership_provider_evidence_id
    WHERE verification.id = ${verificationId}
  `)
  return rows[0]?.id ?? null
}

export async function getTestGooglePlayAcknowledgementRecoveryCursor(): Promise<string | null> {
  const { rows } = await write<{ last_evidence_id: string | null }>(sql`
    /* getTestGooglePlayAcknowledgementRecoveryCursor */
    SELECT last_evidence_id
    FROM membership_google_play_recovery_cursors
    WHERE id = 'acknowledgements'
  `)
  return rows[0]?.last_evidence_id ?? null
}

export async function makeTestGooglePlayAcknowledgementDue(
  acknowledgementId: string,
): Promise<void> {
  await write(sql`
    /* makeTestGooglePlayAcknowledgementDue */
    UPDATE membership_google_play_acknowledgements
    SET next_attempt_at = CURRENT_TIMESTAMP
    WHERE id = ${acknowledgementId}
  `)
}

export async function countTestGooglePlayProviderObservations(
  verificationId: string,
): Promise<number> {
  const { rows } = await write<{ count: string }>(sql`
    /* countTestGooglePlayProviderObservations */
    SELECT count(*)::TEXT AS count
    FROM membership_provider_observations observation
    WHERE observation.membership_provider_lineage_id = (
      SELECT evidence.membership_provider_lineage_id
      FROM membership_verifications verification
      INNER JOIN membership_provider_evidence_records evidence ON evidence.id = verification.membership_provider_evidence_id
      WHERE verification.id = ${verificationId}
    )
  `)
  return Number(rows[0]?.count)
}

export async function getTestGooglePlayTokenLineageSummary(options: {
  firstPurchaseTokenLookupSha256: string
  secondPurchaseTokenLookupSha256: string
}): Promise<{ aliasCount: number; lineageCount: number }> {
  const { rows } = await write<{ alias_count: string; lineage_count: string }>(sql`
    /* getTestGooglePlayTokenLineageSummary */
    SELECT count(*)::TEXT AS alias_count,
      count(DISTINCT membership_provider_lineage_id)::TEXT AS lineage_count
    FROM membership_google_play_purchase_tokens
    WHERE purchase_token_lookup_sha256 = ${options.firstPurchaseTokenLookupSha256}
      OR purchase_token_lookup_sha256 = ${options.secondPurchaseTokenLookupSha256}
  `)
  return {
    aliasCount: Number(rows[0]?.alias_count),
    lineageCount: Number(rows[0]?.lineage_count),
  }
}

export async function createTestGooglePlayRtdnEvidence(options: {
  applicationId: string
  rawBody: Buffer
  corruptEncryptedEvidence?: boolean
}): Promise<string> {
  const lookup = createHash('sha256').update(randomUUID()).digest('hex')
  const encryptedEvidence = options.corruptEncryptedEvidence
    ? Buffer.from('corrupt')
    : Buffer.from(
        encryptSecret(
          options.rawBody.toString('utf8'),
          `membership-provider-evidence:google_play:${lookup}`,
        ),
      )
  const { rows } = await write<{ id: string }>(sql`
    /* createTestGooglePlayRtdnEvidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, provider_event_id,
      evidence_lookup_sha256, encrypted_evidence
    ) VALUES (
      'google_play', 'test', ${options.applicationId}, ${`test-rtdn-${randomUUID()}`},
      ${lookup}, ${encryptedEvidence}
    ) RETURNING id
  `)
  const evidenceId = rows[0]?.id
  if (!evidenceId) throw new Error('Google Play RTDN test evidence was not created')
  return evidenceId
}

export async function createTestCorruptGooglePlayMembershipVerification(options: {
  applicationId: string
  userId: string
}): Promise<string> {
  const evidenceLookupSha256 = createHash('sha256').update(randomUUID()).digest('hex')
  const { rows } = await write<{ id: string }>(sql`
    /* createTestCorruptGooglePlayMembershipVerification */
    WITH evidence AS (
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
      ) VALUES (
        'google_play', 'test', ${options.applicationId}, ${evidenceLookupSha256}, ${Buffer.from('corrupt')}
      ) RETURNING id
    )
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_provider_evidence_id,
      provider, environment, application_id
    ) SELECT
      ${options.userId}, ${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')}, id,
      'google_play', 'test', ${options.applicationId}
    FROM evidence
    RETURNING id
  `)
  const verificationId = rows[0]?.id
  if (!verificationId) throw new Error('Corrupt Google Play verification was not created')
  return verificationId
}

export async function reacceptTestGooglePlayVerifiedEvidence(options: {
  verificationId: string
  lineageId?: string
  membershipProviderProductId?: string
}): Promise<string> {
  await using query = await beginTransaction()
  const { rows } = await query<
    Context & {
      membershipProductId: string
      membershipProviderProductId: string
    }
  >(sql`
    /* reacceptTestGooglePlayVerifiedEvidence */
    SELECT verification.id AS "verificationId", verification.user_id AS "userId",
      verification.membership_purchase_intent_id AS "purchaseIntentId", verification.environment,
      verification.application_id AS "applicationId", evidence.id AS "evidenceId",
      evidence.encrypted_evidence AS "encryptedEvidence",
      evidence.evidence_lookup_sha256 AS "evidenceLookupSha256",
      evidence.rejected_at AS "evidenceRejectedAt", evidence.rejection_reason AS "evidenceRejectionReason",
      evidence.verified_at AS "evidenceVerifiedAt",
      evidence.membership_provider_lineage_id AS "evidenceLineageId",
      observation.membership_product_id AS "membershipProductId",
      observation.membership_provider_product_id AS "membershipProviderProductId"
    FROM membership_verifications verification
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = verification.membership_provider_evidence_id
    INNER JOIN membership_provider_observations observation
      ON observation.membership_provider_evidence_id = evidence.id
    WHERE verification.id = ${options.verificationId}
      AND observation.provider = 'google_play'
  `)
  const context = rows[0]
  if (!context?.evidenceLineageId)
    throw new Error('Google Play verified evidence context was not found')
  const observation: GooglePlayMembershipObservation = {
    provider: 'google_play',
    environment: context.environment,
    applicationId: context.applicationId,
    membershipProductId: context.membershipProductId,
    providerProductId: 'test-existing-observation',
    providerLineageId: context.evidenceLineageId,
    providerEventId: `test-existing-event-${randomUUID()}`,
    providerRevision: 'test-existing-observation',
    providerOrder: 0,
    sourceKind: 'direct',
    lifecycle: 'active',
    effectiveAt: new Date(),
    expiresAt: new Date(),
    terminalAt: null,
    autoRenews: true,
  }
  const observationId = await acceptObservation(
    context,
    options.lineageId ?? context.evidenceLineageId,
    {
      membershipProductId: context.membershipProductId,
      membershipProviderProductId:
        options.membershipProviderProductId ?? context.membershipProviderProductId,
    },
    observation,
    query,
  )
  await query.commit()
  return observationId
}
