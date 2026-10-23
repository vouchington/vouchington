import { read } from '@data-stores/psql'
import { getConfiguredOAuthProviders } from '@services/oauth-accounts/configuration'
import type { OAuthProvider } from './providers.mts'

/** Each provider has at most one linked account for this user; the result is bounded by providers. */
export async function getProviderReAuthMethods(
  currentUserId: string,
  configuredProviders: readonly OAuthProvider[] = getConfiguredOAuthProviders(),
): Promise<OAuthProvider[]> {
  const { rows } = await read<{ provider: OAuthProvider }>(
    `/* getProviderReAuthMethods */ SELECT provider FROM (
       SELECT 'apple' AS provider FROM apple_accounts WHERE user_id = $1
       UNION ALL SELECT 'google' FROM google_accounts WHERE user_id = $1
       UNION ALL SELECT 'facebook' FROM facebook_accounts WHERE user_id = $1
       UNION ALL SELECT 'x' FROM x_accounts WHERE user_id = $1
       UNION ALL SELECT 'linkedin' FROM linkedin_accounts WHERE user_id = $1
       UNION ALL SELECT 'microsoft' FROM microsoft_accounts WHERE user_id = $1
       UNION ALL SELECT 'github' FROM github_accounts WHERE user_id = $1
     ) linked WHERE EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL)`,
    [currentUserId],
  )
  // Reauthentication uses configured providers without enabling ordinary login/link rollout modes.
  return configuredProviders.filter(provider => rows.some(row => row.provider === provider))
}
