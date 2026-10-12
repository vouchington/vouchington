import { createHash, randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  persistGooglePlayTokenLineage,
  type GooglePlayResolvedLineage,
} from '../services/memberships/google/lineage.mts'

export async function getTestGooglePlayVerificationRetryState(id: string): Promise<{
  lease_token: string | null
  leased_at: Date | null
  available_at: Date | null
  last_error: string | null
} | null> {
  const { rows } = await write<{
    lease_token: string | null
    leased_at: Date | null
    available_at: Date | null
    last_error: string | null
  }>(sql`/* getTestGooglePlayVerificationRetryState */
    SELECT lease_token, leased_at, available_at, last_error
    FROM membership_verification_processing_work_items WHERE membership_verification_id = ${id}
  `)
  return rows[0] ?? null
}

export async function getTestGooglePlayRtdnEvidenceTerminalState(
  evidenceId: string,
): Promise<{ rejectionReason: string | null; rejectedAt: Date | null } | null> {
  const { rows } = await write<{ rejection_reason: string | null; rejected_at: Date | null }>(sql`
    /* getTestGooglePlayRtdnEvidenceTerminalState */
    SELECT rejection_reason, rejected_at
    FROM membership_provider_evidence_records WHERE id = ${evidenceId}`)
  const row = rows[0]
  return row ? { rejectionReason: row.rejection_reason, rejectedAt: row.rejected_at } : null
}

export async function persistTestGooglePlayTokenLineage(options: {
  applicationId: string
  rootDigest: string
  token: string
}): Promise<void> {
  await using query = await beginTransaction()
  await persistGooglePlayTokenLineage(
    {
      environment: 'test',
      applicationId: options.applicationId,
      resolved: testGooglePlayResolvedLineage(options.rootDigest, options.token),
    },
    query,
  )
  await query.commit()
}

export async function persistTestGooglePlayResolvedLineage(options: {
  applicationId: string
  resolved: GooglePlayResolvedLineage
}): Promise<{ lineageId: string; submittedTokenFirstFetched: boolean }> {
  await using query = await beginTransaction()
  const result = await persistGooglePlayTokenLineage(
    { environment: 'test', applicationId: options.applicationId, resolved: options.resolved },
    query,
  )
  await query.commit()
  return result
}

export async function getTestGooglePlayTokenAlias(options: {
  applicationId: string
  digest: string
}): Promise<{
  id: string
  lineageId: string
  linkedId: string | null
  fetchedAt: Date | null
} | null> {
  const { rows } = await write<{
    id: string
    membership_provider_lineage_id: string
    linked_purchase_token_id: string | null
    fetched_at: Date | null
  }>(sql`/* getTestGooglePlayTokenAlias */
    SELECT token.id, token.membership_provider_lineage_id, token.linked_purchase_token_id, token.fetched_at
    FROM membership_google_play_purchase_tokens token
    JOIN membership_provider_contexts context ON context.id = token.membership_provider_context_id
    WHERE context.provider = 'google_play' AND context.environment = 'test'
      AND context.application_id = ${options.applicationId}
      AND token.purchase_token_lookup_sha256 = ${options.digest}`)
  const row = rows[0]
  return row
    ? {
        id: row.id,
        lineageId: row.membership_provider_lineage_id,
        linkedId: row.linked_purchase_token_id,
        fetchedAt: row.fetched_at,
      }
    : null
}

export async function linkTestGooglePlayTokenToForeignContext(
  tokenId: string,
  foreignPredecessorId: string,
): Promise<void> {
  await write(sql`/* linkTestGooglePlayTokenToForeignContext */
    UPDATE membership_google_play_purchase_tokens
    SET linked_purchase_token_id = ${foreignPredecessorId}
    WHERE id = ${tokenId}`)
}

export async function createTestMalformedGooglePlayMembershipVerification(options: {
  applicationId: string
  userId: string
}): Promise<string> {
  const evidenceLookupSha256 = createHash('sha256').update(randomUUID()).digest('hex')
  const { rows } = await write<{ id: string }>(sql`
    /* createTestMalformedGooglePlayMembershipVerification */
    WITH evidence AS (
      INSERT INTO membership_provider_evidence_records (
        membership_provider_context_id, evidence_lookup_sha256, encrypted_evidence
      ) VALUES (
        fn_upsert_membership_provider_context_id('google_play', 'test', ${options.applicationId}), ${evidenceLookupSha256}, ${Buffer.from(
          encryptSecret(
            'not-json',
            `membership-provider-evidence:google_play:${evidenceLookupSha256}`,
          ),
        )}
      ) RETURNING id
    )
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_provider_evidence_record_id,
      membership_provider_context_id
    ) SELECT
      ${options.userId}, ${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')}, id,
      fn_upsert_membership_provider_context_id('google_play', 'test', ${options.applicationId})
    FROM evidence
    RETURNING id`)
  const verificationId = rows[0]?.id
  if (!verificationId) throw new Error('Malformed Google Play verification was not created')
  return verificationId
}

function testGooglePlayResolvedLineage(
  rootDigest: string,
  token: string,
): GooglePlayResolvedLineage {
  return {
    rootToken: token,
    rootDigest,
    currentSubscription: {},
    tokens: [{ token, linkedToken: null, fetched: true }],
  }
}
