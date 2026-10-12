import { randomBytes } from 'node:crypto'
import { read, write, type TransactionQuery } from '@data-stores/psql'

export async function prepareTestOAuthRetentionRows(
  clientId: string,
  options: {
    expiresAt: Date
    extraRequests?: number
    extraRefreshTokens?: number
    extraAccessTokens?: number
    only?: 'requests' | 'family' | 'access'
    childExpiresAt?: Date
  },
): Promise<void> {
  const hashes = Array.from({ length: options.extraRefreshTokens ?? 0 }, () =>
    randomBytes(32).toString('hex'),
  )
  const accessHashes = Array.from({ length: options.extraAccessTokens ?? 0 }, () =>
    randomBytes(32).toString('hex'),
  )
  await write(
    `/* prepareTestOAuthRetentionRows */ WITH client AS (
       SELECT id FROM oauth_clients WHERE client_id = $1
     ), requests AS (
       INSERT INTO oauth_authorization_requests
         (client_id, user_id, browser_binding_hash, redirect_uri, client_state, resource, scopes,
          code_challenge, expires_at)
       SELECT client_id, user_id, browser_binding_hash, redirect_uri, client_state, resource, scopes,
          code_challenge, expires_at
       FROM (SELECT request.* FROM oauth_authorization_requests AS request
         WHERE client_id IN (SELECT id FROM client) LIMIT 1) AS template
       CROSS JOIN generate_series(1, $2::int)
     ), refresh AS (
       INSERT INTO oauth_refresh_tokens (family_id, token_hash, scopes, generation, expires_at)
       SELECT template.family_id, hash.value, template.scopes, template.generation + hash.ordinality,
         template.expires_at
       FROM (SELECT token.* FROM oauth_refresh_tokens AS token
         JOIN oauth_refresh_token_families AS family ON family.id = token.family_id
         JOIN oauth_grants AS grant_row ON grant_row.id = family.grant_id
         WHERE grant_row.client_id IN (SELECT id FROM client)
         ORDER BY token.generation DESC LIMIT 1) AS template
       CROSS JOIN unnest($3::text[]) WITH ORDINALITY AS hash(value, ordinality)
     ), access AS (
       INSERT INTO oauth_access_tokens (grant_id, refresh_family_id, token_hash, resource, scopes, expires_at)
       SELECT template.grant_id, template.refresh_family_id, hash, template.resource, template.scopes,
         template.expires_at
       FROM (SELECT token.* FROM oauth_access_tokens AS token
         JOIN oauth_grants AS grant_row ON grant_row.id = token.grant_id
         WHERE grant_row.client_id IN (SELECT id FROM client) LIMIT 1) AS template
       CROSS JOIN unnest($4::text[]) AS hash
     ) SELECT id FROM client`,
    [clientId, options.extraRequests ?? 0, hashes, accessHashes],
  )
  await write(
    `/* prepareTestOAuthRetentionExpiry */ WITH client AS (
       SELECT id FROM oauth_clients WHERE client_id = $1
     ), grants AS (SELECT id FROM oauth_grants WHERE client_id IN (SELECT id FROM client)),
     requests AS (
       UPDATE oauth_authorization_requests SET expires_at = $2
       WHERE client_id IN (SELECT id FROM client) AND ($3::text IS NULL OR $3 = 'requests')
     ), codes AS (
       UPDATE oauth_authorization_codes SET expires_at = $2
       WHERE grant_id IN (SELECT id FROM grants) AND $3::text IS NULL
     ), access AS (
       UPDATE oauth_access_tokens SET expires_at = COALESCE($4::timestamptz, $2)
       WHERE grant_id IN (SELECT id FROM grants) AND ($3::text IS NULL OR $3 = 'family' OR $3 = 'access')
     ), refresh AS (
       UPDATE oauth_refresh_tokens SET expires_at = $4
       WHERE family_id IN (SELECT id FROM oauth_refresh_token_families WHERE grant_id IN (SELECT id FROM grants))
         AND $4::timestamptz IS NOT NULL
     ) UPDATE oauth_refresh_token_families SET expires_at = $2
       WHERE grant_id IN (SELECT id FROM grants) AND ($3::text IS NULL OR $3 = 'family')`,
    [clientId, options.expiresAt, options.only ?? null, options.childExpiresAt ?? null],
  )
}

export async function getTestOAuthRetentionRowCounts(clientId: string): Promise<{
  requests: number
  codes: number
  access: number
  refresh: number
  families: number
  total: number
}> {
  const result = await read<{
    requests: number
    codes: number
    access: number
    refresh: number
    families: number
    total: number
  }>(
    `/* getTestOAuthRetentionRowCounts */ WITH client AS (
       SELECT id FROM oauth_clients WHERE client_id = $1
     ), grants AS (SELECT id FROM oauth_grants WHERE client_id IN (SELECT id FROM client)), counts AS (
       SELECT
         (SELECT count(*)::int FROM oauth_authorization_requests WHERE client_id IN (SELECT id FROM client)) AS requests,
         (SELECT count(*)::int FROM oauth_authorization_codes WHERE grant_id IN (SELECT id FROM grants)) AS codes,
         (SELECT count(*)::int FROM oauth_access_tokens WHERE grant_id IN (SELECT id FROM grants)) AS access,
         (SELECT count(*)::int FROM oauth_refresh_token_families WHERE grant_id IN (SELECT id FROM grants)) AS families,
         (SELECT count(*)::int FROM oauth_refresh_tokens WHERE family_id IN (
           SELECT id FROM oauth_refresh_token_families WHERE grant_id IN (SELECT id FROM grants))) AS refresh
     ) SELECT *, requests + codes + access + families + refresh AS total FROM counts`,
    [clientId],
  )
  return result.rows[0]!
}

export async function getTestOAuthRetentionFamilyId(clientId: string): Promise<string> {
  const result = await write<{ id: string }>(
    `/* getTestOAuthRetentionFamilyId */ SELECT family.id
     FROM oauth_refresh_token_families AS family
     JOIN oauth_grants AS grant_row ON grant_row.id = family.grant_id
     JOIN oauth_clients AS client ON client.id = grant_row.client_id
     WHERE client.client_id = $1 ORDER BY family.id LIMIT 1`,
    [clientId],
  )
  if (!result.rows[0]) throw new Error('Test OAuth family is missing')
  return result.rows[0].id
}

export async function lockTestOAuthRetentionRemainingAccessToken(
  familyIds: readonly string[],
  deletingQuery: TransactionQuery,
  observerQuery: TransactionQuery,
): Promise<number> {
  const remaining = await deletingQuery<{ id: string }>(
    `/* lockTestOAuthRetentionRemainingAccessToken */
     SELECT id FROM oauth_access_tokens WHERE refresh_family_id = ANY($1::uuid[])
     ORDER BY id LIMIT 1`,
    [familyIds],
  )
  if (!remaining.rows[0]) throw new Error('Test OAuth access-token survivor is missing')
  const locked = await observerQuery(
    `/* lockTestOAuthRetentionRemainingAccessToken */
     SELECT id FROM oauth_access_tokens WHERE id = $1 FOR UPDATE NOWAIT`,
    [remaining.rows[0].id],
  )
  return locked.rowCount ?? 0
}

export async function lockTestOAuthRetentionPredecessor(
  clientId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* lockTestOAuthRetentionPredecessor */ SELECT token.id
     FROM oauth_refresh_tokens AS token
     JOIN oauth_refresh_token_families AS family ON family.id = token.family_id
     JOIN oauth_grants AS grant_row ON grant_row.id = family.grant_id
     JOIN oauth_clients AS client ON client.id = grant_row.client_id
     WHERE client.client_id = $1 AND token.replaced_by_token_id IS NOT NULL
     ORDER BY token.id FOR UPDATE OF token`,
    [clientId],
  )
}

export async function lockTestOAuthRetentionFamily(
  clientId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(
    `/* lockTestOAuthRetentionFamily */ SELECT family.id
     FROM oauth_refresh_token_families AS family
     JOIN oauth_grants AS grant_row ON grant_row.id = family.grant_id
     JOIN oauth_clients AS client ON client.id = grant_row.client_id
     WHERE client.client_id = $1 FOR UPDATE OF family`,
    [clientId],
  )
}
