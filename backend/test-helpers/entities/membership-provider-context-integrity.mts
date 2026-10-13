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

export async function rejectTestMicrosoftCredentialOnStripeContext(
  contextId: string,
  userId: string,
): Promise<void> {
  const digest = randomUUID().replaceAll('-', '').repeat(2)
  await write(sql`/* rejectTestMicrosoftCredentialOnStripeContext */
    INSERT INTO membership_microsoft_store_credentials (
      user_id, membership_provider_context_id, publisher_user_id,
      collections_key_lookup_sha256, encrypted_collections_key,
      purchase_key_lookup_sha256, encrypted_purchase_key,
      collections_issued_at, collections_expires_at,
      purchase_issued_at, purchase_expires_at
    ) VALUES (
      ${userId}, ${contextId}, ${userId},
      ${digest}, '\x01'::bytea,
      ${digest}, '\x01'::bytea,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day'
    )`)
}

export async function rejectTestStripeDeletionWorkOnGoogleLineage(): Promise<void> {
  const { rows } = await write<{ request_id: string; lineage_id: string }>(sql`
    /* createNonStripeDeletionWorkFixture */
    WITH owner AS (INSERT INTO users DEFAULT VALUES RETURNING id),
    deletion_request AS (
      INSERT INTO user_deletion_requests (user_id)
      SELECT id FROM owner RETURNING id
    ), lineage AS (
      INSERT INTO membership_provider_lineages (
        membership_provider_context_id, provider_lineage_id
      ) VALUES (
        fn_upsert_membership_provider_context_id('google_play', 'test', ${`play-${randomUUID()}`}),
        ${`lineage-${randomUUID()}`}
      ) RETURNING id
    )
    SELECT deletion_request.id AS request_id, lineage.id AS lineage_id
    FROM deletion_request CROSS JOIN lineage`)
  const { request_id: requestId, lineage_id: lineageId } = rows[0]!

  await write(sql`/* rejectNonStripeDeletionWork */
    INSERT INTO user_deletion_external_works (
      request_id, work_kind, membership_provider_lineage_id
    ) VALUES (${requestId}, 'stripe-customer', ${lineageId})`)
}
