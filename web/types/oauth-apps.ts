import type { PublicUser } from './user'

export type OAuthClientType = 'confidential' | 'public'
export type OAuthClientAuthMethod = 'client_secret_basic' | 'none'
export type OAuthClientVerificationFilter = 'all' | 'unverified' | 'verified'

/** An OAuth app as its owner sees it. The client secret is never readable after issuance. */
export interface OAuthApp {
  id: string
  client_id: string
  client_name: string
  client_type: OAuthClientType
  token_endpoint_auth_method: OAuthClientAuthMethod
  redirect_uris: string[]
  scopes: string[]
  verified_at: string | null
  created_at: string
  updated_at: string
}

/** A freshly minted credential: `client_secret` is shown once and only for confidential apps. */
export interface IssuedOAuthApp {
  oauth_app: OAuthApp
  client_secret: string | null
}

export interface CreateOAuthAppInput {
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: OAuthClientAuthMethod
  scopes: string[]
}

export interface UpdateOAuthAppInput {
  client_name?: string
  redirect_uris?: string[]
}

/** One app the signed-in user has authorized. */
export interface OAuthGrant {
  id: string
  client: {
    id: string
    client_id: string
    client_name: string
    verified: boolean
  }
  resource: string
  scopes: string[]
  consented_at: string
  last_used_at: string
}

/** A dynamically registered client as administrators review it for verification. */
export interface AdminOAuthClient {
  id: string
  client_id: string
  client_name: string
  client_type: OAuthClientType
  redirect_uris: string[]
  scopes: string[]
  owner_user_id: string | null
  verified_at: string | null
  verified_by_id: string | null
  created_at: string
}

/** A verification-queue row, with the owner's public profile when the client has an owner. */
export interface AdminOAuthClientListItem extends AdminOAuthClient {
  owner: (PublicUser & { __entity_type: 'user' }) | null
}
