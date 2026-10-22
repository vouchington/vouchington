export interface OAuthAuthorizationRequest {
  id: string
  client_name: string
  client_hostname: string
  client_is_unverified: boolean
  resource: string
  scopes: string[]
  sensitive_scopes: string[]
  expires_at: string
}

export interface OAuthAuthorizationRequestResponse {
  authorization_request: OAuthAuthorizationRequest
}

export interface OAuthAuthorizationDecisionResponse {
  redirect_uri: string
}
