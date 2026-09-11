import { readOptionalConfigEnv, readOptionalConfigEnvWithDefault } from './env.mts'

export const MICROSOFT_CLIENT_ID = readOptionalConfigEnv('MICROSOFT_CLIENT_ID')
export const MICROSOFT_CLIENT_SECRET = readOptionalConfigEnv('MICROSOFT_CLIENT_SECRET')
export const MICROSOFT_TENANT_ID = readOptionalConfigEnvWithDefault('MICROSOFT_TENANT_ID', 'common')
