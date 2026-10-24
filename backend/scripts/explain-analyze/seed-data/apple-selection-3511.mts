import { write } from '@data-stores/psql'

/** One provider context with many handled notifications and a sparse pending tail. */
export async function seedAppleSelection3511(): Promise<void> {
  console.log('Seeding 10000 Apple notification evidence records...')
  await write(`/* seedAppleSelection3511:context */
    INSERT INTO membership_provider_contexts (id, provider, environment, application_id)
    VALUES ('019e0000-9600-7000-8000-000000000001', 'apple_app_store',
      'test', 'explain-apple-notification-app') ON CONFLICT DO NOTHING`)
  await write(`/* seedAppleSelection3511:lineages */
    INSERT INTO membership_provider_lineages
      (id, membership_provider_context_id, provider_lineage_id)
    SELECT ('019e0000-9700-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      '019e0000-9600-7000-8000-000000000001'::uuid,
      'explain-apple-lineage-' || ordinal
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
  await write(`/* seedAppleSelection3511:evidence */
    INSERT INTO membership_provider_evidence_records
      (id, membership_provider_context_id, provider, membership_provider_lineage_id,
       provider_event_id, evidence_lookup_sha256, encrypted_evidence,
       received_at, verified_at)
    SELECT ('019e0000-9800-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      '019e0000-9600-7000-8000-000000000001'::uuid,
      'apple_app_store',
      ('019e0000-9700-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'explain-apple-event-' || ordinal, lpad(to_hex(ordinal), 64, '0'),
      convert_to('synthetic-evidence', 'UTF8'), NOW() - INTERVAL '2 days',
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() END
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
}
