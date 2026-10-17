import { readOptionalConfigEnv } from './env.mts'

export const GOOGLE_CLIENT_ID = readOptionalConfigEnv('GOOGLE_CLIENT_ID')

// Call-time read so tests and workers that load configuration before env setup see current values.
export function readGoogleClientId(): string {
  return readOptionalConfigEnv('GOOGLE_CLIENT_ID')
}

export function readGoogleClientSecret(): string {
  return readOptionalConfigEnv('GOOGLE_CLIENT_SECRET')
}
