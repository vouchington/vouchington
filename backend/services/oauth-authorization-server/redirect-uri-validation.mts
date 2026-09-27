import { invalidRedirectUri } from './errors.mts'
import {
  MAX_OAUTH_REDIRECT_URIS,
  validateOAuthRedirectUris,
  type OAuthRedirectUriValidationCode,
} from '@ts-shared/utils/oauth-redirect-uri-validation'

export const MAX_REDIRECT_URIS = MAX_OAUTH_REDIRECT_URIS

export function validateRedirectUris(values: unknown): string[] {
  const result = validateOAuthRedirectUris(values)
  if (result.valid) return result.redirectUris
  throw invalidRedirectUri(redirectUriErrorDescription(result.code))
}

function redirectUriErrorDescription(code: OAuthRedirectUriValidationCode): string {
  switch (code) {
    case 'invalid_count':
      return `redirect_uris must contain between 1 and ${MAX_REDIRECT_URIS} entries`
    case 'wildcard':
      return 'redirect URIs cannot contain wildcards'
    case 'userinfo_or_fragment':
      return 'redirect URIs cannot contain userinfo or fragments'
    case 'invalid_scheme':
      return 'redirect URIs must use HTTPS or loopback HTTP'
    case 'duplicate':
      return 'redirect_uris contains duplicates'
    case 'invalid_uri':
      return 'redirect_uris contains an invalid URI'
  }
}
