import { write } from '@data-stores/psql'

/** Pending Google notifications are sparse among verified evidence records. */
export async function seedGoogleSelection3511(): Promise<void> {
  console.log('Seeding 10000 Google notification evidence records...')
  await write(`/* seedGoogleSelection3511:context */
    INSERT INTO membership_provider_contexts (id, provider, environment, application_id)
    VALUES ('019e0000-9900-7000-8000-000000000001', 'google_play',
      'test', 'explain-google-notification-app') ON CONFLICT DO NOTHING`)
  await write(`/* seedGoogleSelection3511:evidence */
    INSERT INTO membership_provider_evidence_records
      (id, membership_provider_context_id, provider_event_id,
       evidence_lookup_sha256, encrypted_evidence, received_at, verified_at)
    SELECT ('019e0000-9a00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      '019e0000-9900-7000-8000-000000000001'::uuid,
      'explain-google-event-' || ordinal, lpad(to_hex(ordinal), 64, '0'),
      convert_to('synthetic-evidence', 'UTF8'), NOW() - INTERVAL '2 days',
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() END
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
}
