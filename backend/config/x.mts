import { readOptionalConfigEnv } from './env.mts'

export const X_CLIENT_ID = readOptionalConfigEnv('X_CLIENT_ID')
export const X_CLIENT_SECRET = readOptionalConfigEnv('X_CLIENT_SECRET')
