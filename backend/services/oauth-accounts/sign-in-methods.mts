import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { getConfiguredOAuthProviders } from './configuration.mts'
import { providerTableConfigs } from './providers.mts'

/** Serialize removals and count only live, supported first factors. Enrollment alone is not proof. */
export async function assertUserHasSignInMethod(
  currentUserId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(
    '/* assertUserHasSignInMethod:userFence */ SELECT fn_lock_active_user_for_mutation($1)',
    [currentUserId],
  )
  await query(
    '/* assertUserHasSignInMethod:lockUser */ SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [currentUserId],
  )
  const checks = [
    'SELECT 1 FROM user_email_addresses WHERE user_id = $1',
    ...getConfiguredOAuthProviders().map(
      provider => `SELECT 1 FROM ${providerTableConfigs[provider].table} WHERE user_id = $1`,
    ),
  ]
  // Phone has no current sign-in verifier. TOTP/Bluesky and unproven passkey enrollment are not first factors.
  const { rows } = await query<{ present: boolean }>(
    `/* assertUserHasSignInMethod */ SELECT EXISTS (${checks.map(check => `(${check} LIMIT 1)`).join(' UNION ALL ')}) AS present`,
    [currentUserId],
  )
  if (!rows[0]?.present) throw createHttpError(400, 'Cannot remove your last authentication method')
}
