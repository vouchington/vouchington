import {
  validateOAuthRedirectUris,
  type OAuthRedirectUriValidationCode,
} from '@ts-shared/utils/oauth-redirect-uri-validation'
import type { Translator } from '@ts-shared/ui-messages'

/** Mirrors the backend limits so the form blocks submissions the API would reject. */
export const MAX_CLIENT_NAME_LENGTH = 120
export { validateOAuthRedirectUris }

/** One redirect URI per line. Preserve repeats so the shared validator can reject them. */
export function parseRedirectUris(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
}

export function redirectUriValidationMessage(
  t: Translator,
  code: OAuthRedirectUriValidationCode,
): string {
  switch (code) {
    case 'invalid_count':
      return t('settings.oauthApps.redirectUriErrors.invalidCount')
    case 'invalid_uri':
      return t('settings.oauthApps.redirectUriErrors.invalidUri')
    case 'wildcard':
      return t('settings.oauthApps.redirectUriErrors.wildcard')
    case 'userinfo_or_fragment':
      return t('settings.oauthApps.redirectUriErrors.userinfoOrFragment')
    case 'invalid_scheme':
      return t('settings.oauthApps.redirectUriErrors.invalidScheme')
    case 'duplicate':
      return t('settings.oauthApps.redirectUriErrors.duplicate')
  }
}

export function hasValidOAuthAppDetails(name: string, redirectUris: readonly string[]): boolean {
  return name.trim() !== '' && validateOAuthRedirectUris(redirectUris).valid
}
