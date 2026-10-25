import { getResolvedKeySet } from './keys.mts'
import {
  SESSION_JWT_PRIVATE_KEYS_ENV,
  SESSION_JWT_PUBLIC_KEYS_ENV,
  type JwtRuntimeOptions,
} from './types.mts'

export async function assertSessionJwtConfiguration(
  options: JwtRuntimeOptions = {},
  requirements: { signing?: boolean } = {},
): Promise<void> {
  const keys = await getResolvedKeySet(options)
  if (keys.publicKeys.length === 0) {
    throw new Error(`${SESSION_JWT_PUBLIC_KEYS_ENV} must contain a verification key`)
  }
  if (requirements.signing && keys.privateKeys.length === 0) {
    throw new Error(`${SESSION_JWT_PRIVATE_KEYS_ENV} must contain a signing key`)
  }
}
