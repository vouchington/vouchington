import { getOAuthBrokerCallbackOriginPath } from './oauth-broker-callback-routing.mts'
import { RSS_ROUTE_RE } from './routing.mts'

// The apikey query param and OAuth callback code/state are bearer-like URL credentials.
// Preserve the origin's stricter policy only on these exact product routes.
export const isKeyedRssReferrerRequest = (url: URL): boolean =>
  RSS_ROUTE_RE.test(url.pathname) && !!url.searchParams.get('apikey')

export const shouldPreserveOriginNoReferrer = (url: URL): boolean =>
  isKeyedRssReferrerRequest(url) || getOAuthBrokerCallbackOriginPath(url.pathname) !== null
