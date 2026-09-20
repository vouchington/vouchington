export interface OAuthAuthorizationRequest {
  id: string
  client_name: string
  resource: string
  scopes: string[]
  expires_at: string
}

export interface OAuthAuthorizationRequestResponse {
  authorization_request: OAuthAuthorizationRequest
}

export interface OAuthAuthorizationDecisionResponse {
  redirect_uri: string
}
