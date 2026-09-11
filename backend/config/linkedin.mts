import { readOptionalConfigEnv } from './env.mts'

export const LINKEDIN_CLIENT_ID = readOptionalConfigEnv('LINKEDIN_CLIENT_ID')
export const LINKEDIN_CLIENT_SECRET = readOptionalConfigEnv('LINKEDIN_CLIENT_SECRET')
