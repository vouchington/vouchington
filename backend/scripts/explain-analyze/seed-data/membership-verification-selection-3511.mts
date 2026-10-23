import { write } from '@data-stores/psql'

/** Terminal work dominates the sparse provider-verification recovery page. */
export async function seedMembershipVerificationSelection3511(): Promise<void> {
  console.log('Seeding 10000 membership verification work items...')
  await write(`/* seedMembershipVerificationSelection3511 */
    INSERT INTO membership_verifications
      (id, idempotency_key, request_fingerprint, membership_provider_evidence_record_id,
       membership_provider_context_id, verified_at, result_code)
    SELECT ('019e0000-a500-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      ('019e0000-a501-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      lpad(to_hex(ordinal), 64, '0'),
      ('019e0000-9a00-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      '019e0000-9900-7000-8000-000000000001'::uuid,
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() END,
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE 'verified'::membership_verification_result_codes END
    FROM generate_series(1, 10000) ordinal ON CONFLICT DO NOTHING`)
}
