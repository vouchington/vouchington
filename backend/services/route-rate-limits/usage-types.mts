import type { ApiUsage } from '@services/analytics'

// The quota vocabulary is the analytics vocabulary, so a metered request and its usage event can
// never disagree about which bucket, plan or scope class they name.
export type UsageSurface = ApiUsage['surface']
export type UsagePlan = ApiUsage['plan']
export type UsageScopeClass = ApiUsage['scope_class']

// The validated principal behind a request. Every field is a row id or a public OAuth client_id,
// never a bearer token or an API key secret.
export type UsageIdentity =
  | { credential: 'api_key'; userId: string; apiKeyId: string }
  | { credential: 'oauth'; userId: string; oauthClientId: string; oauthGrantId: string }

export type UsageQuota = {
  limit: number
  windowSeconds: number
}

export type UsageQuotaCheck = {
  limited: boolean
  /** The full quota window when limited, so a client that waits it out is no longer over quota. */
  retryAfterSeconds: number
}

export type UsageSettlement = {
  surface: UsageSurface
  identity: UsageIdentity
  plan: UsagePlan
  scopeClass: UsageScopeClass
  quota: UsageQuota
  statusCode: number
  durationMs: number
}
