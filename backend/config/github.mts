import { readOptionalConfigEnv } from './env.mts'

export const GITHUB_CLIENT_ID = readOptionalConfigEnv('GITHUB_CLIENT_ID')
export const GITHUB_CLIENT_SECRET = readOptionalConfigEnv('GITHUB_CLIENT_SECRET')
