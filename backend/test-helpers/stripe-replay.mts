import Stripe from 'stripe'
import {
  loadRecordedResponse,
  type ProviderReplay,
  type RecordedResponse,
  type ReplayedRequest,
} from './provider-replay.mts'

// Stripe adapter for the shared provider replay (see docs/development/testing/backend/helpers.md).
// Stripe takes an `httpClient`, not a `fetch` option, so `replayClient()` does not apply. A test
// replays recorded responses by either spying on `getProviderFetch` (to run the real
// `getStripeClient()`) or spying on `getStripeClient()` with `createReplayStripeClient()`; the real
// SDK serializes the request and parses the recorded bytes either way. Module mocks of internal
// modules are not allowed (`no-mistakes/module-mock-boundary`), hence spies.

/**
 * The key the replayed client authenticates with. The `sk_test_` prefix keeps test mode; it is
 * assembled from parts because it is a fixture, not a credential a secret scanner should flag.
 * `getStripeClient()` reads `STRIPE_SECRET_KEY` once when `@voucha/config` loads, so a test that
 * wants the real function stubs the variable and `vi.resetModules()` before importing it.
 */
export const STRIPE_REPLAY_SECRET_KEY = ['sk', 'test', 'replay_fixture'].join('_')

/**
 * A real `Stripe` client sending through `fetch`, for a DB-backed test whose setup files already
 * loaded `@voucha/config`: pair it with `vi.spyOn(stripeClientModule, 'getStripeClient')`. The key
 * wiring of `getStripeClient()` itself is covered by `client.replay.test.mts`. The SDK
 * does not retry, so a request nothing answers fails at once instead of sleeping through a backoff.
 */
export function createReplayStripeClient(fetch: ProviderReplay['fetch']): Stripe {
  return new Stripe(STRIPE_REPLAY_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(fetch),
    maxNetworkRetries: 0,
  })
}

export type StripeRoutes = {
  /** Pass this to `createReplayStripeClient`. */
  fetch: ProviderReplay['fetch']
  /** Answers `<METHOD> <path>` with `responses` in order; the last one answers every later request. */
  on: (method: string, path: string, ...responses: RecordedResponse[]) => void
  /** Fails unless every route answered at least once and used each of its queued responses. */
  assertAnswered: () => void
  reset: () => void
}

/**
 * Answers by method and path instead of by arrival order, for a flow whose number of identical
 * reads is ours to change (a paginated scan, a verify-after-write). A request no route matches
 * fails. Requests are still captured on `replay.requests`.
 */
export function routeStripeReplay(replay: ProviderReplay): StripeRoutes {
  const routes = new Map<string, { responses: RecordedResponse[]; served: number }>()
  const fetch: ProviderReplay['fetch'] = (input, init) => {
    const request = new Request(input, init)
    const key = `${request.method} ${new URL(request.url).pathname}`
    const route = routes.get(key)
    if (!route) return Promise.reject(new Error(`Stripe replay has no route for ${key}`))
    replay.respondWith(route.responses[Math.min(route.served, route.responses.length - 1)]!)
    route.served += 1
    return replay.fetch(input, init)
  }
  return {
    fetch,
    on: (method, path, ...responses) =>
      void routes.set(`${method} ${path}`, { responses, served: 0 }),
    assertAnswered: () => {
      for (const [key, { responses, served }] of routes) {
        if (served < responses.length) {
          throw new Error(`Stripe replay route ${key} served ${served} of ${responses.length}`)
        }
      }
    },
    reset: () => routes.clear(),
  }
}

/** Loads `provider-fixtures/stripe/<name>`; `replace` swaps tokens such as ids unique per run. */
export function loadStripeFixture(
  name: string,
  replace: Record<string, string> = {},
): RecordedResponse {
  return loadRecordedResponse(`stripe/${name}`, { replace })
}

/** The decoded query string of a Stripe `GET`, where nested parameters are `key[0]`/`key[sub]`. */
export function stripeQuery(request: ReplayedRequest): URLSearchParams {
  return new URL(request.url).searchParams
}

/** The decoded form body of a Stripe `POST`: Stripe takes form encoding, never JSON. */
export function stripeFormBody(request: ReplayedRequest): URLSearchParams {
  return new URLSearchParams(request.body?.toString('utf8') ?? '')
}
