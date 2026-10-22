import { invalidClientMetadata, validateClientName } from '@vouchington/oauth-server'
import { getNativeOAuthClientDocument, NATIVE_OAUTH_CLIENT_APPS } from './native-clients.mts'

export function validateOAuthAppName(value: unknown): string {
  const name = validateClientName(value)
  const normalized = normalizeName(name)
  const reservedNames = [
    'Voucha',
    ...NATIVE_OAUTH_CLIENT_APPS.map(app => getNativeOAuthClientDocument(app).client_name),
  ]
  if (reservedNames.some(reserved => normalizeName(reserved) === normalized)) {
    throw invalidClientMetadata('client_name is reserved')
  }
  return name
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}
