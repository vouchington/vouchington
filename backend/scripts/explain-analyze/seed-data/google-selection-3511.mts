import { write } from '@data-stores/psql'

/** Pending Google notifications are sparse among verified evidence records. */
export async function seedGoogleSelection3511(): Promise<void> {
  console.log('Seeding 10000 Google and 10000 unrelated pending notification records...')
  await write(`/* seedGoogleSelection3511:otherProviderNoise */
    INSERT INTO membership_provider_evidence_records
      (id, membership_provider_context_id, provider, provider_event_id,
       evidence_lookup_sha256, encrypted_evidence, received_at)
    SELECT ('019e0000-99ff-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      context.id, 'stripe', 'explain-stripe-pending-' || ordinal,
      lpad(to_hex(ordinal + 100000), 64, '0'),
      convert_to('synthetic-other-provider-evidence', 'UTF8'), NOW() - INTERVAL '2 days'
    FROM membership_provider_contexts context
    CROSS JOIN generate_series(1, 10000) ordinal
    WHERE context.provider = 'stripe' AND context.environment = 'production'
      AND context.application_id = 'voucha-web'
    ON CONFLICT DO NOTHING`)
  await write(`/* seedGoogleSelection3511:context */
    INSERT INTO membership_provider_contexts (id, provider, environment, application_id)
    VALUES ('019e0000-9900-7000-8000-000000000001', 'google_play',
      'test', 'explain-google-notification-app') ON CONFLICT DO NOTHING`)
  await write(`/* seedGoogleSelection3511:evidence */
    INSERT INTO membership_provider_evidence_records
      (id, membership_provider_context_id, provider, provider_event_id,
       evidence_lookup_sha256, encrypted_evidence, received_at, verified_at)
    SELECT ('019e0000-9a00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      '019e0000-9900-7000-8000-000000000001'::uuid,
      'google_play',
      'explain-google-event-' || ordinal, lpad(to_hex(ordinal), 64, '0'),
      convert_to('synthetic-evidence', 'UTF8'), NOW() - INTERVAL '2 days',
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() END
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
}
