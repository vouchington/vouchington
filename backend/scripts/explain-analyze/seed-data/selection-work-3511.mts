import { write } from '@data-stores/psql'
import { seedBedrockSelection3511 } from './bedrock-selection-3511.mts'
import { seedStoryClaim3511 } from './story-claim-3511.mts'
import { seedCrawlSelection3511 } from './crawl-selection-3511.mts'
import { seedAppleSelection3511 } from './apple-selection-3511.mts'
import { seedGoogleSelection3511 } from './google-selection-3511.mts'
import { seedCopyrightSelection3511 } from './copyright-selection-3511.mts'
import { seedProviderSourceSelection3511 } from './provider-source-selection-3511.mts'
import { seedCategorySelection3511 } from './category-selection-3511.mts'
import { seedMembershipVerificationSelection3511 } from './membership-verification-selection-3511.mts'
import { seedRetentionSelection3511 } from './retention-selection-3511.mts'
import { seedMembershipExpirySelection3511 } from './membership-expiry-selection-3511.mts'
import { seedMailSelection3511 } from './mail-selection-3511.mts'

/** Large, mostly ineligible selector backlogs expose reads hidden by a tiny dev fixture. */
export async function seedSelectionWork3511(): Promise<void> {
  console.log('Seeding account-data and friend-sync selector backlogs...')
  await write(`/* seedSelectionWork3511:dataRequests */
    WITH owners AS (
      SELECT id, row_number() OVER (ORDER BY id) AS ordinal
      FROM users WHERE id::text LIKE '019e0000-0100-%'
      ORDER BY id LIMIT 15000
    )
    INSERT INTO user_data_requests
      (id, user_id, requested_by_id, dispatched_at, processing_started_at,
       completed_at, s3_key, expires_at)
    SELECT ('019e0000-9100-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      id, id,
      CASE WHEN ordinal BETWEEN 10001 AND 10500 THEN NOW() - INTERVAL '90 minutes' ELSE NOW() END,
      CASE WHEN ordinal <= 10000 THEN NOW() - INTERVAL '2 days' ELSE NULL END,
      CASE WHEN ordinal <= 10000 THEN NOW() - INTERVAL '1 day' ELSE NULL END,
      CASE WHEN ordinal <= 10000 THEN 'explain/selection/' || ordinal ELSE NULL END,
      CASE WHEN ordinal <= 500 THEN NOW() - INTERVAL '1 hour'
        WHEN ordinal <= 10000 THEN NOW() + INTERVAL '7 days' ELSE NULL END
    FROM owners ON CONFLICT DO NOTHING`)

  await write(`/* seedSelectionWork3511:facebookAccounts */
    WITH owners AS (
      SELECT id, row_number() OVER (ORDER BY id) AS ordinal
      FROM users WHERE id::text LIKE '019e0000-0100-%'
      ORDER BY id LIMIT 10000
    )
    INSERT INTO facebook_accounts
      (id, user_id, facebook_user_id, facebook_user_data, access_token_ciphertext,
       friends_synced_at)
    SELECT ('019e0000-9200-7000-8000-' || lpad(to_hex(ordinal), 12, '0'))::uuid,
      id, 'explain-friend-sync-' || ordinal,
      jsonb_build_object('name', 'Explain friend ' || ordinal), 'fixture-ciphertext',
      CASE WHEN ordinal % 100 = 0 THEN NULL ELSE NOW() END
    FROM owners ON CONFLICT DO NOTHING`)
  await seedBedrockSelection3511()
  await seedStoryClaim3511()
  await seedCrawlSelection3511()
  await seedAppleSelection3511()
  await seedGoogleSelection3511()
  await seedMembershipVerificationSelection3511()
  await seedCopyrightSelection3511()
  await seedProviderSourceSelection3511()
  await seedCategorySelection3511()
  await seedRetentionSelection3511()
  await seedMembershipExpirySelection3511()
  await seedMailSelection3511()
}
