export type OAuthAuthorizationExchangeJobData = {
  authorizationId: string
  /** Write-ahead ownership only; never provider credentials, tokens or errors. */
  exchangeClaimId?: string
  /** Persisted before provider admission; an interrupted request has an unknown outcome. */
  exchangeProviderRequestArmed?: true
}

export type OAuthAuthorizationExchangeJobs =
  | 'exchangeOAuthAuthorization'
  | 'dispatchOAuthAuthorizationExchanges'
