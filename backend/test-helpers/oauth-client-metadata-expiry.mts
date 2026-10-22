import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'

/** All freshness reads and writes share PostgreSQL's stable transaction timestamp. */
export async function createTestOAuthMetadataExpiryFixture(offsetMs: -1 | 0 | 1, revoked = false) {
  await using resources = new AsyncDisposableStack()
  const query = resources.use(await beginTransaction())
  const clientId = `https://client.example/${randomUUID()}/metadata.json`
  await query(
    `/* createTestOAuthMetadataExpiryFixture */ INSERT INTO oauth_clients (
         client_id, metadata_url, metadata_refresh_generation, metadata_refreshed_at,
         metadata_expires_at, client_name, client_type, token_endpoint_auth_method,
         redirect_uris, grant_types, response_types, scopes, revoked_at
       ) VALUES (
         $1, $1, nextval('oauth_client_metadata_refresh_generation_seq'), CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP + $2::integer * INTERVAL '1 millisecond', 'Cached metadata',
         'public', 'none', ARRAY['https://app.example/oauth/callback']::text[],
         ARRAY['authorization_code', 'refresh_token']::oauth_grant_types[],
         ARRAY['code']::oauth_response_types[], ARRAY['mcp.user:read']::api_scopes[],
         CASE WHEN $3::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
       )`,
    [clientId, offsetMs, revoked],
  )
  const readClock = async () => {
    const { rows } = await query<{ backend_pid: number; transaction_time: string }>(
      `/* readTestOAuthMetadataExpiryClock */ SELECT
           pg_backend_pid() AS backend_pid, CURRENT_TIMESTAMP::text AS transaction_time`,
    )
    const clock = rows[0]
    if (!clock) throw new Error('Expected the owned metadata transaction clock')
    return clock
  }
  const clock = await readClock()
  const lifetime = resources.move()
  return {
    clientId,
    query,
    clock,
    readClock,
    async [Symbol.asyncDispose]() {
      await lifetime.disposeAsync()
    },
  }
}
