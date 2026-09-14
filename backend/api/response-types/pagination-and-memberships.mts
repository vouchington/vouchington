import type * as Deps from './dependencies.mts'

type ElectionVote = Deps.ElectionVote
type PageInfo = Deps.PageInfo
type PaginatedResult = Deps.PaginatedResult

// TypeScript 7 workaround for PageInfo resolution
export type { PageInfo }

/**
 * Base paginated response structure shared by all API endpoints
 */
export type PaginatedResponse<TResult extends PaginatedResult> = {
  results: TResult[]
  page_info: PageInfo
  bookmarks?: Record<string, Record<string, boolean>>
  election_votes?: Record<string, ElectionVote>
}

/**
 * Membership plans response body
 */
export type MembershipPlansResponseBody = {
  products: import('@services/memberships').MembershipCatalogProduct[]
  benefit_catalog: import('@services/memberships/benefit-catalog').MembershipBenefitCatalog
}

/**
 * Current user's membership response body
 */
export type MembershipResponseBody = {
  membership: Awaited<
    ReturnType<typeof import('@services/memberships').getMembershipOverview>
  >['membership']
  sources: Awaited<
    ReturnType<typeof import('@services/memberships').getMembershipOverview>
  >['sources']
  pending: Awaited<
    ReturnType<typeof import('@services/memberships').getMembershipOverview>
  >['pending']
  management: Awaited<
    ReturnType<typeof import('@services/memberships').getMembershipOverview>
  >['management']
}

export type MembershipPurchaseIntentResponseBody = {
  purchase_intent: import('@services/memberships').MembershipPurchaseIntent
}

export type MembershipVerificationResponseBody = {
  verification: import('@services/memberships').MembershipVerification
}

export type MicrosoftStoreServiceTicketsResponseBody = {
  service_tickets: import('@services/memberships/microsoft').MicrosoftStoreServiceTickets
}

/**
 * Stripe billing portal session response body
 */
export type BillingPortalSessionResponseBody = {
  portal_session: {
    url: string
  }
}
