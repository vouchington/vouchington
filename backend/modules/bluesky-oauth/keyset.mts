import { parseEcKeyset, type KeysetRuntimeMode } from '@vouchington/oauth-client/atproto'
import testPrivateKey from './test-jwk-private-key.mts'

// The AT Protocol authorization server verifies this keyset, so it uses the SDK's own ES256
// default rather than mirroring ts-shared/session-jwt's RS512 keys.
export const BLUESKY_JWT_ALGORITHM = 'ES256'
const BLUESKY_JWT_PRIVATE_KEYS_ENV = 'VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64'

export type BlueskyJwtRuntimeMode = KeysetRuntimeMode

function getDefaultMode(): BlueskyJwtRuntimeMode {
  if (process.env.NODE_ENV === 'production') return 'production'
  if (process.env.NODE_ENV === 'test') return 'test'
  return 'development'
}

export interface BlueskyJwtRuntimeOptions {
  mode?: BlueskyJwtRuntimeMode
  env?: string
}

// createBlueskyOAuthClient() and getBlueskyClientMetadata() both call this and must agree on the
// exact same signing keys; parseEcKeyset memoizes per mode and env value. The bundled test key is
// offered only outside production.
export function getBlueskyKeyset(options?: BlueskyJwtRuntimeOptions) {
  const mode = options?.mode ?? getDefaultMode()
  return parseEcKeyset({
    env: options?.env ?? process.env[BLUESKY_JWT_PRIVATE_KEYS_ENV] ?? '',
    mode,
    envName: BLUESKY_JWT_PRIVATE_KEYS_ENV,
    fallbackKey: mode === 'production' ? undefined : testPrivateKey,
  })
}
