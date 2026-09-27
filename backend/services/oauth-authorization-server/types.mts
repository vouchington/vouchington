import type { ApiScope } from '@modules/scopes'

export type OAuthClientType = 'confidential' | 'public'
export type OAuthClientAuthMethod = 'client_secret_basic' | 'none'

export type OAuthClient = {
  id: string
  client_id: string
  metadata_url: string | null
  metadata_refresh_generation: string | null
  metadata_refreshed_at: Date | null
  metadata_expires_at: Date | null
  owner_user_id: string | null
  client_name: string
  client_type: OAuthClientType
  token_endpoint_auth_method: OAuthClientAuthMethod
  redirect_uris: string[]
  grant_types: Array<'authorization_code' | 'refresh_token'>
  response_types: ['code']
  scopes: ApiScope[]
  client_secret_hash: string | null
  revoked_at: Date | null
  created_at: Date
  updated_at: Date
}

export type RegisterOAuthClientInput = {
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method?: OAuthClientAuthMethod
  grant_types?: string[]
  response_types?: string[]
  scope: string
}

export type ClientIdMetadataDocument = RegisterOAuthClientInput & {
  client_id: string
  client_secret?: unknown
  client_secret_expires_at?: unknown
  jwks?: unknown
  jwks_uri?: unknown
}

export type RegisteredOAuthClient = {
  client_id: string
  client_id_issued_at: number
  client_name: string
  client_secret?: string
  client_secret_expires_at?: 0
  grant_types: string[]
  redirect_uris: string[]
  response_types: string[]
  scope: string
  token_endpoint_auth_method: OAuthClientAuthMethod
}

export type OAuthTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: string
  token_type: 'Bearer'
}

export type OAuthAccessPrincipal = {
  client_id: string
  expires_at: Date
  resource: string
  scopes: ApiScope[]
  user_id: string
}

export type OAuthAuthorizationRequestView = {
  id: string
  client_name: string
  client_hostname: string | null
  resource: string
  scopes: ApiScope[]
  expires_at: Date
}

declare const validatedOAuthAuthorizationRequest: unique symbol

export type ValidatedOAuthAuthorizationRequest = {
  readonly [validatedOAuthAuthorizationRequest]: never
  client: OAuthClient
  codeChallenge: string
  redirectUri: string
  resource: string
  scopes: ApiScope[]
  state: string
}
