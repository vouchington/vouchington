import { readOptionalConfigEnv } from './env.mts'

export const APPLE_CLIENT_ID = readOptionalConfigEnv('APPLE_CLIENT_ID')
export const APPLE_NATIVE_CLIENT_IDS = readOptionalConfigEnv('APPLE_NATIVE_CLIENT_IDS')
  .split(',')
  .flatMap(value => {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  })
