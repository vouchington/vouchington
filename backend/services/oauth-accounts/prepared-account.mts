import { upsertOAuthAccount } from './upsert.mts'
import type { PreparedOAuthAccount } from './reauthentication.mts'

/** Capture verified provider facts without writing until the owning mutation is admitted. */
export function prepareOAuthAccountPersistence(
  ...args: Parameters<typeof upsertOAuthAccount>
): PreparedOAuthAccount {
  const [provider, providerUserId, email, data, tokens, options] = args
  return {
    persist: persistence =>
      upsertOAuthAccount(provider, providerUserId, email, data, tokens, {
        ...options,
        ...persistence,
      }),
  }
}
