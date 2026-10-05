import { write } from '@data-stores/psql'

export async function insertTestClientIdMetadataClient(input: {
  clientId: string
  clientName: string
  redirectUris: string[]
  scopes: string[]
}): Promise<void> {
  await write(
    `/* insertTestClientIdMetadataClient */ INSERT INTO oauth_clients (
       client_id, metadata_url, metadata_refresh_generation, metadata_refreshed_at,
       metadata_expires_at, client_name, client_type, token_endpoint_auth_method,
       redirect_uris, grant_types, response_types, scopes
     ) VALUES (
       $1, $1, nextval('oauth_client_metadata_refresh_generation_seq'), CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP + INTERVAL '5 minutes', $2, 'public', 'none', $3::text[],
       ARRAY['authorization_code', 'refresh_token']::oauth_grant_types[], ARRAY['code']::oauth_response_types[], $4::api_scopes[]
     )`,
    [input.clientId, input.clientName, input.redirectUris, input.scopes],
  )
}

export async function testOAuthClientExists(clientId: string): Promise<boolean> {
  const result = await write<{ exists: boolean }>(
    `/* testOAuthClientExists */ SELECT EXISTS(
       SELECT 1 FROM oauth_clients WHERE client_id = $1
     ) AS exists`,
    [clientId],
  )
  return result.rows[0]?.exists ?? false
}

export async function revokeTestOAuthClient(clientId: string): Promise<void> {
  await write(
    `/* revokeTestOAuthClient */ UPDATE oauth_clients
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE client_id = $1`,
    [clientId],
  )
}
