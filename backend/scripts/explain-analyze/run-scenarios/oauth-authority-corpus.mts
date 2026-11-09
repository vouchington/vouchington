import { write } from '@data-stores/psql'

export const OAUTH_AUTHORITY_NOISE_COUNT = 4000

/** Selective participant joins must be measured against more than a tiny OAuth fixture. */
export async function seedOAuthAuthorityCorpus(
  clientId: string,
  userId: string,
): Promise<string[]> {
  const { rows } = await write<{ id: string }>(
    `/* seedOAuthAuthorityCorpus */ WITH grants AS (
       INSERT INTO oauth_grants (user_id, client_id, resource, scopes)
       SELECT $1::uuid, $2::uuid, 'https://explain.invalid/oauth/' || n, ARRAY['topics:read']::api_scopes[]
       FROM generate_series(1, $3::integer) AS n RETURNING id, resource, scopes
     ), families AS (
       INSERT INTO oauth_refresh_token_families (grant_id, resource, scopes, expires_at)
       SELECT id, resource, scopes, CURRENT_TIMESTAMP + INTERVAL '1 day' FROM grants
       RETURNING id, grant_id, resource, scopes, expires_at
     ), tokens AS (
     INSERT INTO oauth_refresh_tokens (family_id, token_hash, scopes, generation, expires_at)
     SELECT id, encode(sha256(id::text::bytea), 'hex'), scopes, 0, expires_at FROM families
     RETURNING id
     ), access AS (
     INSERT INTO oauth_access_tokens (grant_id, refresh_family_id, token_hash, resource, scopes, expires_at)
     SELECT grant_id, id, encode(sha256(('access:' || id)::bytea), 'hex'), resource, scopes, expires_at
     FROM families RETURNING id
     ) SELECT id FROM grants`,
    [userId, clientId, OAUTH_AUTHORITY_NOISE_COUNT],
  )
  return rows.map(row => row.id)
}

export async function cleanupOAuthAuthorityCorpus(
  clientId: string,
  noiseIds: readonly string[],
): Promise<void> {
  // The generated client owns all noise and public-flow artifacts; cascades remove live grants/tokens.
  await write('/* cleanupOAuthAuthorityCorpus */ DELETE FROM oauth_clients WHERE id = $1::uuid', [
    clientId,
  ])
  await write(
    '/* cleanupOAuthNoiseAnchors */ DELETE FROM oauth_grant_retention_anchors WHERE id = ANY($1::uuid[])',
    [noiseIds],
  )
  await write(`/* vacuumOAuthAuthorityCorpus */ VACUUM (ANALYZE)
    oauth_grants, oauth_refresh_token_families, oauth_refresh_tokens, oauth_access_tokens, oauth_authorization_codes`)
}

export async function analyzeOAuthAuthorityCorpus(): Promise<void> {
  await write('/* analyzeOAuthAuthorityCorpus codes */ ANALYZE oauth_authorization_codes')
  await write('/* analyzeOAuthAuthorityCorpus requests */ ANALYZE oauth_authorization_requests')
  await write('/* analyzeOAuthAuthorityCorpus oauth_grants */ ANALYZE oauth_grants')
  await write(
    '/* analyzeOAuthAuthorityCorpus oauth_refresh_token_families */ ANALYZE oauth_refresh_token_families',
  )
  await write('/* analyzeOAuthAuthorityCorpus oauth_refresh_tokens */ ANALYZE oauth_refresh_tokens')
  await write('/* analyzeOAuthAuthorityCorpus oauth_access_tokens */ ANALYZE oauth_access_tokens')
}
