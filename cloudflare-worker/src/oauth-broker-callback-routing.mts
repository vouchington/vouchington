const OAUTH_BROKER_CALLBACK_ROUTE_RE = /^\/auth\/callback\/(facebook|x|github)\/broker\/?$/i

export const getOAuthBrokerCallbackOriginPath = (pathname: string): string | null => {
  const match = pathname.match(OAUTH_BROKER_CALLBACK_ROUTE_RE)
  return match ? `/api/v1/auth/oauth/${match[1].toLowerCase()}/broker-callback` : null
}
