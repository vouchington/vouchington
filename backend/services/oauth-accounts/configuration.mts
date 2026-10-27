import {
  APPLE_CLIENT_ID,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  X_CLIENT_ID,
  X_CLIENT_SECRET,
} from '@voucha/config'
import type { OAuthProvider } from './providers.mts'

export function getConfiguredOAuthProviders(): OAuthProvider[] {
  return [
    FACEBOOK_APP_ID && FACEBOOK_APP_SECRET && 'facebook',
    APPLE_CLIENT_ID && 'apple',
    GOOGLE_CLIENT_ID && 'google',
    X_CLIENT_ID && X_CLIENT_SECRET && 'x',
    LINKEDIN_CLIENT_ID && LINKEDIN_CLIENT_SECRET && 'linkedin',
    MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && 'microsoft',
    GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && 'github',
  ].filter(Boolean) as OAuthProvider[]
}
