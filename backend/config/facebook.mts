import { readOptionalConfigEnv } from './env.mts'

export const FACEBOOK_APP_ID = readOptionalConfigEnv('FACEBOOK_APP_ID')
export const FACEBOOK_APP_SECRET = readOptionalConfigEnv('FACEBOOK_APP_SECRET')
export const FACEBOOK_GRAPHQL_VERSION = 'v25.0'
