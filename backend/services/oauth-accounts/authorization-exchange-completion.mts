import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import type { OAuthProvider } from './providers.mts'

export async function completeOAuthAuthorizationExchange(
  provider: OAuthProvider,
  authorizationId: string,
  authorizationClaimId: string,
  providerAccountId: string,
  query: TransactionQuery,
): Promise<void> {
  if (
    provider !== 'facebook' &&
    provider !== 'google' &&
    provider !== 'x' &&
    provider !== 'github' &&
    provider !== 'linkedin' &&
    provider !== 'microsoft'
  ) {
    throw new Error(`OAuth authorization broker does not support ${provider}`)
  }
  const providerIdColumn = {
    facebook: 'facebook_account_id',
    google: 'google_account_id',
    x: 'x_account_id',
    github: 'github_account_id',
    linkedin: 'linkedin_account_id',
    microsoft: 'microsoft_account_id',
  }[provider]
  const { rowCount } = await query(
    `/* completeOAuthAuthorizationExchange */ UPDATE oauth_authorizations
     SET          ${providerIdColumn} = $2,
         callback_code_ciphertext = NULL,
         exchange_claim_id = NULL,
         completion_ready_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND provider = $3
       AND status = 'callback_received'
       AND exchange_claim_id = $4`,
    [authorizationId, providerAccountId, provider, authorizationClaimId],
  )
  if (rowCount !== 1) {
    throw createHttpError(409, 'OAuth authorization exchange is no longer active')
  }
}
