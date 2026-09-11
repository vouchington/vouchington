export type OAuthAuthorizationExchangeJobData = {
  authorizationId: string
}

export type OAuthAuthorizationExchangeJobs =
  | 'exchangeOAuthAuthorization'
  | 'dispatchOAuthAuthorizationExchanges'
