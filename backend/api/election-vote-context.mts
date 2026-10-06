import type { Context } from '@jongleberry/api-server'
import type { VoteRouteContext } from './election-vote-handler-options.mts'

/**
 * Forwards the vote handler's context operations without passing the route `ctx` value into the
 * factory result. Contract discovery fail-closes that direct argument as an opaque response.
 */
export function voteContext(ctx: Context): VoteRouteContext {
  return {
    getCurrentUser: () => ctx.getCurrentUser(),
    assert: (...args) => ctx.assert(...args),
    throw: (status, message, code) => ctx.throw(status, message, code),
    applyRouteRateLimit: (routeKey, extras) => ctx.applyRouteRateLimit(routeKey, extras),
    get params() {
      return ctx.params
    },
    request: {
      json: limit => ctx.request.json(limit),
    },
    getSessionTokenData: (sessionToken, deviceToken) =>
      ctx.getSessionTokenData(sessionToken, deviceToken),
    get ip() {
      return ctx.ip
    },
    get req() {
      return ctx.req
    },
    setStatus: code => ctx.setStatus(code),
  }
}
