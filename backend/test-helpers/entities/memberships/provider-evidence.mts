import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestMembershipProviderEvidenceId(
  membershipId: string,
): Promise<string | undefined> {
  const { rows } = await read<{ membership_provider_evidence_record_id: string }>(
    sql`/* getTestMembershipProviderEvidenceId */
      SELECT observation.membership_provider_evidence_record_id
      FROM memberships membership
      INNER JOIN membership_source_states source_state
        ON source_state.membership_source_id = membership.membership_source_id
      INNER JOIN membership_provider_observations observation
        ON observation.id = source_state.membership_provider_observation_id
      WHERE membership.id = ${membershipId}`,
  )
  return rows[0]?.membership_provider_evidence_record_id
}

export async function getTestMembershipProviderEvidence(
  evidenceId: string,
): Promise<
  { provider_event_id: string | null; membership_provider_lineage_id: string | null } | undefined
> {
  const { rows } = await read<{
    provider_event_id: string | null
    membership_provider_lineage_id: string | null
  }>(sql`/* getTestMembershipProviderEvidence */
    SELECT provider_event_id, membership_provider_lineage_id
    FROM membership_provider_evidence_records WHERE id = ${evidenceId}`)
  return rows[0]
}

export async function getTestMembershipProviderEvidenceTerminalState(evidenceId: string) {
  const { rows } = await read<{
    verified_at: Date | null
    rejected_at: Date | null
    rejection_reason: string | null
    observation_count: number
  }>(sql`/* getTestMembershipProviderEvidenceTerminalState */
    SELECT evidence.verified_at, evidence.rejected_at, evidence.rejection_reason,
      COUNT(observation.id)::int AS observation_count
    FROM membership_provider_evidence_records evidence
    LEFT JOIN membership_provider_observations observation
      ON observation.membership_provider_evidence_record_id = evidence.id
    WHERE evidence.id = ${evidenceId}
    GROUP BY evidence.id`)
  return rows[0]
}

export async function createTestPendingMembershipVerification(userId: string): Promise<string> {
  const applicationId = `verification-test-${randomUUID()}`
  const { rows: evidenceRows } = await write<{ id: string }>(
    allowUnannotatedQuery(sql`
    INSERT INTO membership_provider_evidence_records (
      membership_provider_context_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES (
      fn_upsert_membership_provider_context_id('apple_app_store', 'test', ${applicationId}), ${'a'.repeat(64)}, ${Buffer.from('test')}
    ) RETURNING id`),
  )
  const evidenceId = evidenceRows[0]?.id
  if (!evidenceId) throw new Error('Membership verification test evidence was not returned')

  const { rows } = await write<{ id: string }>(
    allowUnannotatedQuery(sql`
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_provider_evidence_record_id,
      membership_provider_context_id
    ) VALUES (
      ${userId}, ${randomUUID()}, ${'b'.repeat(64)}, ${evidenceId},
      fn_upsert_membership_provider_context_id('apple_app_store', 'test', ${applicationId})
    ) RETURNING id`),
  )
  const verificationId = rows[0]?.id
  if (!verificationId) throw new Error('Membership verification test row was not returned')
  return verificationId
}
