const OAUTH_BROKER_CALLBACK_ROUTE_RE = /^\/auth\/callback\/(facebook|x|github)\/broker\/?$/i

export const getOAuthBrokerCallbackOriginPath = (pathname: string): string | null => {
  const match = pathname.match(OAUTH_BROKER_CALLBACK_ROUTE_RE)
  const provider = match?.[1]
  return provider ? `/api/v1/auth/oauth/${provider.toLowerCase()}/broker-callback` : null
}
