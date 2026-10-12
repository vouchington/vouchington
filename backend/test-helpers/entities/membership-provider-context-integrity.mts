import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestMembershipProviderContext(): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* createTestMembershipProviderContext */
    SELECT fn_upsert_membership_provider_context_id(
      'stripe', 'test', ${`context-integrity-${randomUUID()}`}
    ) AS id`)
  return rows[0]!.id
}

export async function updateTestMembershipProviderContext(id: string): Promise<void> {
  await write(sql`/* updateTestMembershipProviderContext */
    UPDATE membership_provider_contexts SET application_id = ${`changed-${randomUUID()}`}
    WHERE id = ${id}`)
}

export async function deleteTestMembershipProviderContext(id: string): Promise<void> {
  await write(sql`/* deleteTestMembershipProviderContext */
    DELETE FROM membership_provider_contexts WHERE id = ${id}`)
}

export async function rejectTestGoogleRowsOnStripeContext(contextId: string): Promise<{
  token: () => Promise<void>
  acknowledgment: () => Promise<void>
}> {
  const { rows } = await write<{ lineage_id: string; evidence_id: string }>(sql`
    /* rejectTestGoogleRowsOnStripeContext */
    WITH lineage AS (
      INSERT INTO membership_provider_lineages (membership_provider_context_id, provider_lineage_id)
      VALUES (${contextId}, ${`lineage-${randomUUID()}`}) RETURNING id
    ), evidence AS (
      INSERT INTO membership_provider_evidence_records (
        membership_provider_context_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence
      ) SELECT ${contextId}, lineage.id, ${randomUUID().replaceAll('-', '').repeat(2)}, '\x01'::bytea
      FROM lineage RETURNING id, membership_provider_lineage_id
    ) SELECT membership_provider_lineage_id AS lineage_id, id AS evidence_id FROM evidence
  `)
  const { lineage_id: lineageId, evidence_id: evidenceId } = rows[0]!
  const digest = randomUUID().replaceAll('-', '').repeat(2)
  return {
    token: async () => {
      await write(sql`/* rejectTestGoogleRowsOnStripeContext:token */
        INSERT INTO membership_google_play_purchase_tokens (
          membership_provider_context_id, membership_provider_lineage_id,
          purchase_token_lookup_sha256, encrypted_purchase_token
        ) VALUES (${contextId}, ${lineageId}, ${digest}, '\x01'::bytea)`)
    },
    acknowledgment: async () => {
      await write(sql`/* rejectTestGoogleRowsOnStripeContext:acknowledgment */
        INSERT INTO membership_google_play_acknowledgments (
          membership_provider_context_id, membership_provider_lineage_id,
          membership_provider_evidence_record_id, subscription_id,
          purchase_token_lookup_sha256, encrypted_purchase_token
        ) VALUES (${contextId}, ${lineageId}, ${evidenceId}, 'test-subscription',
          ${digest}, '\x01'::bytea)`)
    },
  }
}
