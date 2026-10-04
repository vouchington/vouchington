/** Result projections use built-in text-array decoding while storage remains enum arrays. */
export const OAUTH_CLIENT_COLUMNS = `id, client_id, metadata_url, metadata_refresh_generation,
  metadata_refreshed_at, metadata_expires_at, verified_at, verified_by_id, owner_user_id,
  client_name, client_type, token_endpoint_auth_method, redirect_uris,
  grant_types::text[] AS grant_types, response_types::text[] AS response_types,
  scopes::text[] AS scopes, client_secret_hash, revoked_at, created_at, updated_at`
