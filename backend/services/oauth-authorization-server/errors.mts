export type OAuthErrorCode =
  | 'access_denied'
  | 'invalid_client'
  | 'invalid_client_metadata'
  | 'invalid_grant'
  | 'invalid_redirect_uri'
  | 'invalid_request'
  | 'invalid_scope'
  | 'server_error'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'

export class OAuthProtocolError extends Error {
  readonly code: OAuthErrorCode
  readonly status: number

  constructor(code: OAuthErrorCode, description: string, status = 400) {
    super(description)
    this.name = 'OAuthProtocolError'
    this.code = code
    this.status = status
  }
}

export function invalidRequest(description: string): OAuthProtocolError {
  return new OAuthProtocolError('invalid_request', description)
}

export function invalidClientMetadata(description: string): OAuthProtocolError {
  return new OAuthProtocolError('invalid_client_metadata', description)
}

export function invalidRedirectUri(description: string): OAuthProtocolError {
  return new OAuthProtocolError('invalid_redirect_uri', description)
}
