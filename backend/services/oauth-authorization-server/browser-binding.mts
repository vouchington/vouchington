import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'

export function createOAuthBrowserBindingHash(deviceId: string, sessionId: string): string {
  return hashToken(OAUTH_SECRET_PURPOSES.browserBinding, `${deviceId}:${sessionId}`)
}
