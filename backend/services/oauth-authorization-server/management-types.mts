import type { OAuthClientAuthMethod, OAuthClientType } from './types.mts'

/** An OAuth app as its owner sees it. The client secret is never readable after issuance. */
export type OAuthAppView = {
  id: string
  client_id: string
  client_name: string
  client_type: OAuthClientType
  token_endpoint_auth_method: OAuthClientAuthMethod
  redirect_uris: string[]
  scopes: string[]
  verified_at: Date | null
  created_at: Date
  updated_at: Date
}

/** Result of minting a credential: `client_secret` is shown once and only for confidential apps. */
export type IssuedOAuthApp = {
  oauth_app: OAuthAppView
  client_secret: string | null
}

export type OAuthAppChanges = {
  client_name?: unknown
  redirect_uris?: unknown
}

export type OAuthGrantClientView = {
  id: string
  client_id: string
  client_name: string
  verified: boolean
}

/** One app a user has authorized, as listed on the user's connected-apps surface. */
export type OAuthGrantView = {
  id: string
  client: OAuthGrantClientView
  resource: string
  scopes: string[]
  consented_at: Date
  last_used_at: Date
}

export type OAuthManagementPage<TItem> = {
  results: TItem[]
  hasNextPage: boolean
}
