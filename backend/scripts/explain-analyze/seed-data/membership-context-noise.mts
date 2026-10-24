import { write } from '@data-stores/psql'

export const MEMBERSHIP_CONTEXT_NOISE_COUNT = 10_000

export async function seedMembershipProviderContextNoise(): Promise<void> {
  console.log(`Seeding ${MEMBERSHIP_CONTEXT_NOISE_COUNT} unrelated provider contexts...`)
  await write(`/* seedMembershipProviderContextNoise */
    INSERT INTO membership_provider_contexts (id, provider, environment, application_id)
    SELECT ('019e0000-9601-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      'stripe', 'test', 'explain-context-noise-' || ordinal
    FROM generate_series(1, ${MEMBERSHIP_CONTEXT_NOISE_COUNT}) ordinal
    ON CONFLICT DO NOTHING`)
}
