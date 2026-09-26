export type OAuthGrantClientView = {
  id: string
  client_id: string
  client_name: string
  verified: boolean
}

/** One app a user has authorized, as listed on the user's connected-apps surface. */
export type OAuthGrantView = {
  id: string
  client: OAuthGrantClientView
  resource: string
  scopes: string[]
  consented_at: Date
  last_used_at: Date
}

export type OAuthManagementPage<TItem> = {
  results: TItem[]
  hasNextPage: boolean
}
