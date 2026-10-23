import { write } from '@data-stores/psql'

/** Large source sets with a sparse Google live tail and Microsoft credential tail. */
export async function seedProviderSourceSelection3511(): Promise<void> {
  console.log('Seeding Google and Microsoft source recovery backlogs...')
  await write(`/* seedProviderSourceSelection3511:context */
    INSERT INTO membership_provider_contexts (id, provider, environment, application_id)
    VALUES ('019e0000-9d00-7000-8000-000000000001', 'microsoft_store',
      'test', 'explain-microsoft-recovery-app') ON CONFLICT DO NOTHING`)
  for (const [prefix, contextId, provider] of [
    ['9e00', '019e0000-9900-7000-8000-000000000001', 'google'],
    ['9f00', '019e0000-9d00-7000-8000-000000000001', 'microsoft'],
  ] as const) {
    // no-mistakes-disable-next-line query-reached-per-item: two fixed provider contexts each receive one set-based 10k-lineage fixture insert.
    await write(
      `/* seedProviderSourceSelection3511:lineages */
      INSERT INTO membership_provider_lineages
        (id, membership_provider_context_id, provider_lineage_id)
      SELECT ('019e0000-${prefix}-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
        $1::uuid, 'explain-${provider}-source-' || ordinal
      FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`,
      [contextId],
    )
  }
  for (const [sourcePrefix, lineagePrefix] of [
    ['2000', '9e00'],
    ['2100', '9f00'],
  ] as const) {
    // no-mistakes-disable-next-line query-reached-per-item: two fixed provider prefixes each receive one set-based 10k-source fixture insert.
    await write(`/* seedProviderSourceSelection3511:sources */
      WITH owners AS (
        SELECT id, row_number() OVER (ORDER BY id) AS ordinal
        FROM users WHERE id::text LIKE '019e0000-0100-%'
        ORDER BY id LIMIT 10000
      )
      INSERT INTO membership_sources
        (id, user_id, source_kind, membership_provider_lineage_id)
      SELECT ('019e0000-${sourcePrefix}-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
        id, 'direct',
        ('019e0000-${lineagePrefix}-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid
      FROM owners ON CONFLICT DO NOTHING`)
    // no-mistakes-disable-next-line query-reached-per-item: each provider state insert depends on its own completed source insert and is set-based.
    await write(`/* seedProviderSourceSelection3511:states */
      INSERT INTO membership_source_states
        (membership_source_id, source_kind, membership_provider_lineage_id,
         membership_product_id, effective_at, cancelled_at)
      SELECT source.id, 'direct', source.membership_provider_lineage_id,
        (SELECT id FROM membership_products ORDER BY id LIMIT 1),
        NOW() - INTERVAL '3 days',
        CASE WHEN '${sourcePrefix}' = '2000' AND ordinal % 100 <> 0
          THEN NOW() - INTERVAL '1 day' ELSE NULL END
      FROM (
        SELECT id, membership_provider_lineage_id,
          row_number() OVER (ORDER BY id) AS ordinal
        FROM membership_sources WHERE id::text LIKE '019e0000-${sourcePrefix}-%'
      ) source ON CONFLICT DO NOTHING`)
  }
  await write(`/* seedProviderSourceSelection3511:googleTokens */
    INSERT INTO membership_google_play_purchase_tokens
      (id, membership_provider_context_id, purchase_token_lookup_sha256,
       encrypted_purchase_token, membership_provider_lineage_id, fetched_at)
    SELECT ('019e0000-a300-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      '019e0000-9900-7000-8000-000000000001'::uuid,
      lpad(to_hex(ordinal), 64, '0'), convert_to('synthetic-token', 'UTF8'),
      ('019e0000-9e00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      NOW() - INTERVAL '1 day'
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
  await write(`/* seedProviderSourceSelection3511:microsoftCredentials */
    WITH owners AS (
      SELECT id, row_number() OVER (ORDER BY id) AS ordinal
      FROM users WHERE id::text LIKE '019e0000-0100-%'
      ORDER BY id LIMIT 10000
    )
    INSERT INTO membership_microsoft_store_credentials
      (id, user_id, membership_provider_context_id, publisher_user_id,
       collections_key_lookup_sha256, encrypted_collections_key,
       purchase_key_lookup_sha256, encrypted_purchase_key,
       collections_issued_at, collections_expires_at,
       purchase_issued_at, purchase_expires_at)
    SELECT ('019e0000-a400-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      id, '019e0000-9d00-7000-8000-000000000001'::uuid, id::text,
      lpad(to_hex(ordinal), 64, '0'), convert_to('synthetic-collections-key', 'UTF8'),
      lpad(to_hex(ordinal + 10000), 64, '0'), convert_to('synthetic-purchase-key', 'UTF8'),
      NOW() - INTERVAL '1 day',
      CASE WHEN ordinal % 100 = 0 THEN NOW() + INTERVAL '1 day'
        ELSE NOW() - INTERVAL '1 hour' END,
      NOW() - INTERVAL '1 day',
      CASE WHEN ordinal % 100 = 0 THEN NOW() + INTERVAL '1 day'
        ELSE NOW() - INTERVAL '1 hour' END
    FROM owners ON CONFLICT DO NOTHING`)
}
