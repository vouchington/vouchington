import { assertSessionJwtConfiguration } from '@ts-shared/session-jwt'
import { isDeployedWorkerEnvironment } from '../production-mode.mts'
import type { Env } from '../types.mts'

export async function assertWorkerSessionJwtConfiguration(env: Env): Promise<void> {
  if (!isDeployedWorkerEnvironment(env)) return
  await assertSessionJwtConfiguration({ env, mode: 'production' })
  const privateKeys = env.VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64
  const publicKeys = env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
  if (Boolean(privateKeys) !== Boolean(publicKeys))
    throw new Error('Worker edge anon session keys must be configured together')
  if (!privateKeys) return
  await assertSessionJwtConfiguration(
    {
      mode: 'production',
      env: {
        VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: privateKeys,
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: publicKeys,
      },
    },
    { signing: true },
  )
}
