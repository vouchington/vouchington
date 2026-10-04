import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const OAUTH_CLIENT_VERIFICATION_UNVERIFIED_SEED_COUNT = 25_000
export const OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_COUNT = 1000
export const OAUTH_CLIENT_VERIFICATION_TABLE_TAG = '2c'
export const OAUTH_CLIENT_VERIFICATION_TOTAL_SEED_COUNT =
  OAUTH_CLIENT_VERIFICATION_UNVERIFIED_SEED_COUNT + OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_COUNT
export const OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_STRIDE =
  OAUTH_CLIENT_VERIFICATION_TOTAL_SEED_COUNT / OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_COUNT

export async function seedOAuthClientVerification(): Promise<void> {
  console.log(
    `Seeding ${OAUTH_CLIENT_VERIFICATION_TOTAL_SEED_COUNT} OAuth clients for verification...`,
  )
  await write(
    `/* seedExplainData */ WITH client_indexes AS (
      SELECT generate_series(0, $1 - 1) AS seed_index
    )
    INSERT INTO oauth_clients (
      id, client_id, client_name, client_type, token_endpoint_auth_method, redirect_uris,
      grant_types, response_types, scopes, verified_at
    )
    SELECT
      format('019e0000-${OAUTH_CLIENT_VERIFICATION_TABLE_TAG}00-7000-8000-%s', lpad(to_hex(seed_index), 12, '0'))::uuid,
      format('voucha_%s', lpad(seed_index::text, 32, '0')),
      format('EXPLAIN OAuth client %s', seed_index),
      'public', 'none', ARRAY['https://oauth-client.example/callback'],
      ARRAY['authorization_code', 'refresh_token']::oauth_grant_types[], ARRAY['code']::oauth_response_types[], ARRAY['profile:read']::api_scopes[],
      CASE WHEN seed_index % $2 = 0 THEN NOW() ELSE NULL END
    FROM client_indexes
    ON CONFLICT DO NOTHING`,
    [OAUTH_CLIENT_VERIFICATION_TOTAL_SEED_COUNT, OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_STRIDE],
  )
}

export function oauthClientVerificationSeedId(index: number): string {
  return seedUuid(index, OAUTH_CLIENT_VERIFICATION_TABLE_TAG)
}
