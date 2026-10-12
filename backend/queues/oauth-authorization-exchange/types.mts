export type OAuthAuthorizationExchangeJobData = {
  authorizationId: string
  /** Write-ahead ownership only; never provider credentials, tokens or errors. */
  exchangeClaimId?: string
}

export type OAuthAuthorizationExchangeJobs =
  | 'exchangeOAuthAuthorization'
  | 'dispatchOAuthAuthorizationExchanges'
