import { getResolvedKeySet } from './keys.mts'
import { SESSION_JWT_PRIVATE_KEYS_ENV, type JwtRuntimeOptions } from './types.mts'

export async function assertSessionJwtConfiguration(
  options: JwtRuntimeOptions = {},
  requirements: { signing?: boolean } = {},
): Promise<void> {
  const keys = await getResolvedKeySet(options)
  if (requirements.signing && keys.privateKeys.length === 0) {
    throw new Error(`${SESSION_JWT_PRIVATE_KEYS_ENV} must contain a signing key`)
  }
  await Promise.all([
    ...keys.privateKeys.map(async key => {
      if ((await key.cryptoKey).type !== 'private') {
        throw new Error(`${SESSION_JWT_PRIVATE_KEYS_ENV} must contain private signing keys`)
      }
    }),
    ...keys.publicKeys.map(key => key.cryptoKey),
  ])
}
