import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import type { OAuthProvider } from './providers.mts'

export async function completeOAuthAuthorizationExchange(
  provider: OAuthProvider,
  authorizationId: string,
  authorizationClaimId: string,
  providerUserId: string,
  query: TransactionQuery,
): Promise<void> {
  if (provider !== 'facebook' && provider !== 'x' && provider !== 'github') {
    throw new Error(`OAuth authorization broker does not support ${provider}`)
  }
  const providerIdColumn = {
    facebook: 'facebook_user_id',
    x: 'x_user_id',
    github: 'github_user_id',
  }[provider]
  const { rowCount } = await query(
    `/* completeOAuthAuthorizationExchange */ UPDATE oauth_authorizations
     SET status = 'completion_ready',
         ${providerIdColumn} = $2,
         callback_code_ciphertext = NULL,
         exchange_claim_id = NULL,
         completion_ready_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND provider = $3
       AND status = 'exchanging'
       AND exchange_claim_id = $4`,
    [authorizationId, providerUserId, provider, authorizationClaimId],
  )
  if (rowCount !== 1) {
    throw createHttpError(409, 'OAuth authorization exchange is no longer active')
  }
}
