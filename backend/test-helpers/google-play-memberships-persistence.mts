import { createHash, randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import {
  persistGooglePlayTokenLineage,
  type GooglePlayResolvedLineage,
} from '../services/memberships/google/lineage.mts'

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

export async function createTestMalformedGooglePlayMembershipVerification(options: {
  applicationId: string
  userId: string
}): Promise<string> {
  const evidenceLookupSha256 = createHash('sha256').update(randomUUID()).digest('hex')
  const { rows } = await write<{ id: string }>(sql`
    /* createTestMalformedGooglePlayMembershipVerification */
    WITH evidence AS (
      INSERT INTO membership_provider_evidence_records (
        provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
      ) VALUES (
        'google_play', 'test', ${options.applicationId}, ${evidenceLookupSha256}, ${Buffer.from(
          encryptSecret(
            'not-json',
            `membership-provider-evidence:google_play:${evidenceLookupSha256}`,
          ),
        )}
      ) RETURNING id
    )
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_provider_evidence_id,
      provider, environment, application_id
    ) SELECT
      ${options.userId}, ${randomUUID()}, ${createHash('sha256').update(randomUUID()).digest('hex')}, id,
      'google_play', 'test', ${options.applicationId}
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
    tokens: [{ token, linkedToken: null }],
  }
}
