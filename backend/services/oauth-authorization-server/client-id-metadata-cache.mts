import type { QueryExecutor } from '@data-stores/psql'
import { OAuthProtocolError } from './errors.mts'
import type { OAuthClient } from './types.mts'

export const CLIENT_ID_METADATA_DEFAULT_TTL_MS = 5 * 60_000
export const CLIENT_ID_METADATA_MAX_TTL_MS = 60 * 60_000

export type ValidatedClientIdMetadata = {
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: 'none'
  grant_types: Array<'authorization_code' | 'refresh_token'>
  response_types: ['code']
  scopes: OAuthClient['scopes']
}

export function getClientIdMetadataExpiry(headers: Pick<Headers, 'get'>, now: Date): Date {
  const directives = (headers.get('cache-control')?.toLowerCase() ?? '')
    .split(',')
    .map(value => value.trim())
  let lifetimeMs = CLIENT_ID_METADATA_DEFAULT_TTL_MS
  const forbidsReuse = directives.includes('no-store') || directives.includes('no-cache')
  if (forbidsReuse) {
    lifetimeMs = 0
  } else {
    const maxAgeDirective = directives.find(value => value.startsWith('max-age='))
    if (maxAgeDirective) {
      const rawMaxAge = maxAgeDirective.slice('max-age='.length).replace(/^"|"$/gu, '')
      lifetimeMs = /^\d+$/u.test(rawMaxAge) ? Number(rawMaxAge) * 1000 : 0
    }
  }
  lifetimeMs = Math.min(lifetimeMs, CLIENT_ID_METADATA_MAX_TTL_MS)
  const ageSeconds = headers.get('age')
  const ageMs = ageSeconds && /^\d+$/u.test(ageSeconds) ? Number(ageSeconds) * 1000 : 0
  const dateMs = Date.parse(headers.get('date') ?? '')
  const apparentAgeMs = Number.isFinite(dateMs) ? Math.max(0, now.getTime() - dateMs) : 0
  return new Date(now.getTime() + Math.max(0, lifetimeMs - Math.max(ageMs, apparentAgeMs)))
}

export async function getFreshClientIdMetadataClient(
  clientId: string,
  query: QueryExecutor,
): Promise<OAuthClient | null> {
  const result = await query<OAuthClient>(
    `/* getFreshClientIdMetadataClient */ SELECT *
     FROM oauth_clients
     WHERE client_id = $1
       AND metadata_url = $1
       AND metadata_expires_at > CURRENT_TIMESTAMP
       AND revoked_at IS NULL`,
    [clientId],
  )
  return result.rows[0] ?? null
}

export async function beginClientIdMetadataRefresh(
  query: QueryExecutor,
): Promise<{ generation: string; startedAt: Date }> {
  const result = await query<{ generation: string; started_at: Date }>(
    `/* beginClientIdMetadataRefresh */ SELECT
       nextval('oauth_client_metadata_refresh_generation_seq') AS generation,
       clock_timestamp() AS started_at`,
  )
  const refresh = result.rows[0]
  if (!refresh) {
    throw new OAuthProtocolError('server_error', 'client metadata refresh could not start')
  }
  return { generation: refresh.generation, startedAt: refresh.started_at }
}

export async function getClientIdMetadataClient(
  clientId: string,
  query: QueryExecutor,
): Promise<OAuthClient | null> {
  const result = await query<OAuthClient>(
    `/* getClientIdMetadataClient */ SELECT *
     FROM oauth_clients
     WHERE client_id = $1 AND metadata_url = $1 AND revoked_at IS NULL`,
    [clientId],
  )
  return result.rows[0] ?? null
}

export async function upsertClientIdMetadataClient(
  metadataUrl: string,
  metadata: ValidatedClientIdMetadata,
  refresh: { generation: string; startedAt: Date; expiresAt: Date },
  query: QueryExecutor,
): Promise<OAuthClient | null> {
  const result = await query<OAuthClient>(
    `/* upsertClientIdMetadataClient */ INSERT INTO oauth_clients (
       client_id, metadata_url, metadata_refresh_generation, metadata_refreshed_at,
       metadata_expires_at, owner_user_id, client_name, client_type,
       token_endpoint_auth_method, redirect_uris, grant_types, response_types, scopes,
       client_secret_hash
     ) VALUES ($1, $1, $2, $3, $4, NULL, $5, 'public', 'none', $6::text[], $7::text[],
               $8::text[], $9::text[], NULL)
     ON CONFLICT (client_id) DO UPDATE SET
       metadata_refresh_generation = EXCLUDED.metadata_refresh_generation,
       metadata_refreshed_at = EXCLUDED.metadata_refreshed_at,
       metadata_expires_at = EXCLUDED.metadata_expires_at,
       client_name = EXCLUDED.client_name,
       redirect_uris = EXCLUDED.redirect_uris,
       grant_types = EXCLUDED.grant_types,
       response_types = EXCLUDED.response_types,
       scopes = EXCLUDED.scopes
     WHERE oauth_clients.metadata_url = EXCLUDED.metadata_url
       AND oauth_clients.revoked_at IS NULL
       AND oauth_clients.metadata_refresh_generation < EXCLUDED.metadata_refresh_generation
     RETURNING *`,
    [
      metadataUrl,
      refresh.generation,
      refresh.startedAt,
      refresh.expiresAt,
      metadata.client_name,
      metadata.redirect_uris,
      metadata.grant_types,
      metadata.response_types,
      metadata.scopes,
    ],
  )
  return result.rows[0] ?? null
}
