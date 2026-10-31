import { write } from '@data-stores/psql'

export async function seedProviderRecoveryNotifications(): Promise<{
  appleId: string
  googleId: string
}> {
  const { rows: contexts } = await write<{ apple_id: string; google_id: string }>(
    `/* seedExplainProviderRecovery:contexts */ SELECT
       fn_upsert_membership_provider_context_id('apple_app_store', 'production',
         'explain-apple-recovery') AS apple_id,
       fn_upsert_membership_provider_context_id('google_play', 'production',
         'explain-google-recovery') AS google_id`,
  )
  const { apple_id: appleId, google_id: googleId } = contexts[0]!
  const { rows: lineages } = await write<{ id: string }>(
    `/* seedExplainProviderRecovery:lineage */
     WITH inserted AS (
       INSERT INTO membership_provider_lineages
         (membership_provider_context_id, provider_lineage_id)
       VALUES ($1::uuid, 'explain-apple-recovery-lineage')
       ON CONFLICT DO NOTHING RETURNING id
     ) SELECT id FROM inserted
       UNION ALL SELECT id FROM membership_provider_lineages
       WHERE membership_provider_context_id = $1::uuid
         AND provider_lineage_id = 'explain-apple-recovery-lineage'
       LIMIT 1`,
    [appleId],
  )
  const appleLineageId = lineages[0]!.id
  await write(
    `/* seedExplainProviderRecovery:appleEvidence */
     INSERT INTO membership_provider_evidence_records
       (id, membership_provider_context_id, membership_provider_lineage_id,
        provider_event_id, evidence_lookup_sha256, encrypted_evidence, received_at)
     SELECT format('019e0000-aa00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid, $2::uuid, 'explain-apple-event-' || n,
       encode(sha256(('explain-apple-' || n)::bytea), 'hex'), '\\x01'::bytea,
       NOW() - (n + 1) * INTERVAL '1 hour'
     FROM generate_series(0, 1999) AS n ON CONFLICT DO NOTHING`,
    [appleId, appleLineageId],
  )
  await write(
    `/* seedExplainProviderRecovery:googleEvidence */
     INSERT INTO membership_provider_evidence_records
       (id, membership_provider_context_id, provider_event_id,
        evidence_lookup_sha256, encrypted_evidence, received_at)
     SELECT format('019e0000-ab00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid, 'explain-google-event-' || n,
       encode(sha256(('explain-google-' || n)::bytea), 'hex'), '\\x01'::bytea,
       NOW() - (n + 1) * INTERVAL '1 hour'
     FROM generate_series(0, 1999) AS n ON CONFLICT DO NOTHING`,
    [googleId],
  )
  await write(
    `/* seedExplainProviderRecovery:terminalEvidence */
     INSERT INTO membership_provider_evidence_records
       (id, membership_provider_context_id, provider_event_id,
        evidence_lookup_sha256, encrypted_evidence, received_at, verified_at)
     SELECT format('019e0000-ae00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid, 'explain-google-terminal-' || n,
       encode(sha256(('explain-google-terminal-' || n)::bytea), 'hex'), '\\x01'::bytea,
       NOW() - (n + 1) * INTERVAL '1 minute', NOW()
     FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
    [googleId],
  )
  await write(`/* seedExplainProviderRecovery:analyze */
    ANALYZE membership_provider_contexts, membership_provider_lineages,
      membership_provider_evidence_records`)

  return { appleId, googleId }
}

export async function seedActiveProviderSourceRows(
  contextId: string,
  productId: string,
  lineageTag: string,
  sourceTag: string,
  userOffset: number,
): Promise<void> {
  const lineagePrefix = `019e0000-${lineageTag}00-7000-8000-`
  const sourcePrefix = `019e0000-${sourceTag}00-7000-8000-`
  await write(
    `/* seedExplainProviderRecovery:sourceLineages */
     INSERT INTO membership_provider_lineages
       (id, membership_provider_context_id, provider_lineage_id)
     SELECT ($1::text || lpad(n::text, 12, '0'))::uuid,
       $2::uuid, 'explain-recovery-' || $3::text || '-' || n
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [lineagePrefix, contextId, lineageTag],
  )
  await write(
    `/* seedExplainProviderRecovery:sources */
     INSERT INTO membership_sources
       (id, user_id, source_kind, membership_provider_lineage_id)
     SELECT ($1::text || lpad(n::text, 12, '0'))::uuid,
       format('019e0000-0100-7000-8000-%s',
         lpad(to_hex(($3::integer + n)), 12, '0'))::uuid,
       'direct', ($2::text || lpad(n::text, 12, '0'))::uuid
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [sourcePrefix, lineagePrefix, userOffset],
  )
  await write(
    `/* seedExplainProviderRecovery:states */
     INSERT INTO membership_source_states
       (membership_source_id, source_kind, membership_provider_lineage_id,
        membership_product_id, effective_at)
     SELECT ($1::text || lpad(n::text, 12, '0'))::uuid,
       'direct', ($2::text || lpad(n::text, 12, '0'))::uuid,
       $3::uuid, NOW() - INTERVAL '1 day'
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [sourcePrefix, lineagePrefix, productId],
  )
}

export async function seedMembershipVerificationRecovery(googleId: string): Promise<void> {
  await write(
    `/* seedExplainMembershipVerificationRecovery */
     INSERT INTO membership_verifications
       (id, user_id, idempotency_key, request_fingerprint,
        membership_provider_evidence_record_id, membership_provider_context_id)
     SELECT format('019e0000-ac00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       format('019e0000-0100-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       format('019e0000-ad00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       encode(sha256(('explain-verification-' || n)::bytea), 'hex'),
       format('019e0000-ab00-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [googleId],
  )
  await write(
    `/* seedExplainMembershipVerificationRecovery:analyze */ ANALYZE membership_verifications`,
  )
}

export async function seedGoogleAcknowledgmentRecovery(googleId: string): Promise<void> {
  await write(
    `/* seedExplainProviderRecovery:ackEvidence */
     INSERT INTO membership_provider_evidence_records
       (id, membership_provider_context_id, membership_provider_lineage_id,
        evidence_lookup_sha256, encrypted_evidence, verified_at)
     SELECT format('019e0000-b800-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid,
       format('019e0000-b200-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       encode(sha256(('explain-google-ack-' || n)::bytea), 'hex'),
       '\\x01'::bytea, NOW()
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [googleId],
  )
  await write(
    `/* seedExplainProviderRecovery:acknowledgements */
     INSERT INTO membership_google_play_acknowledgments
       (id, membership_provider_evidence_record_id, membership_provider_lineage_id,
        membership_provider_context_id, subscription_id,
        purchase_token_lookup_sha256, encrypted_purchase_token)
     SELECT format('019e0000-b900-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       format('019e0000-b800-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       format('019e0000-b200-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       $1::uuid, 'explain-subscription-' || n,
       encode(sha256(('explain-google-ack-token-' || n)::bytea), 'hex'),
       '\\x01'::bytea
     FROM generate_series(0, 99) AS n ON CONFLICT DO NOTHING`,
    [googleId],
  )
  await write(
    `/* seedExplainProviderRecovery:ackStats */ ANALYZE membership_google_play_acknowledgment_work_items`,
  )
}

export async function seedMicrosoftRecoveryCredentials(microsoftId: string): Promise<void> {
  await write(
    `/* seedExplainProviderRecovery:microsoftCredentials */
     INSERT INTO membership_microsoft_store_credentials
       (id, user_id, membership_provider_context_id, publisher_user_id,
        collections_key_lookup_sha256, encrypted_collections_key,
        purchase_key_lookup_sha256, encrypted_purchase_key,
        collections_issued_at, collections_expires_at,
        purchase_issued_at, purchase_expires_at)
     SELECT format('019e0000-b700-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
       user_id, $1::uuid, user_id::text,
       encode(sha256(('explain-ms-collections-' || n)::bytea), 'hex'), '\\x01'::bytea,
       encode(sha256(('explain-ms-purchase-' || n)::bytea), 'hex'), '\\x01'::bytea,
       NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
       NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day'
     FROM (SELECT n, format('019e0000-0100-7000-8000-%s',
       lpad(to_hex(13000 + n), 12, '0'))::uuid AS user_id
       FROM generate_series(0, 99) AS n) users
     ON CONFLICT DO NOTHING`,
    [microsoftId],
  )
}
