import onError from '@modules/on-error'
import { OAuthProtocolError } from '@vouchington/oauth-server'

export function unavailableClientIdMetadata(
  cause?: unknown,
  reportError: (error: Error) => void = onError,
): OAuthProtocolError {
  if (cause !== undefined) {
    reportError(new Error('OAuth client metadata fetch failed', { cause }))
  }
  return new OAuthProtocolError(
    'unauthorized_client',
    'client metadata document is unavailable',
    400,
    cause === undefined ? undefined : { cause },
  )
}
