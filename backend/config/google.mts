import { readOptionalConfigEnv } from './env.mts'

export const GOOGLE_CLIENT_ID = readOptionalConfigEnv('GOOGLE_CLIENT_ID')

// Call-time read. The constant above is fixed when this module is first imported.
export function readGoogleClientId(): string {
  return readOptionalConfigEnv('GOOGLE_CLIENT_ID')
}
