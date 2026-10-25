import type { QueryOptions } from '@data-stores/psql/types'
import { createRequestQueryOptionsListener } from '../../api/request-query-options.mts'
import supertest from 'supertest'
import fn, { createApiRequestGuardedListener } from '../../api/app.mts'
import '../../api/index.mts'
import http from 'node:http'
import { Buffer } from 'node:buffer'
import type { PrivateUser } from '../../services/users/types.mts'
import {
  createAuthenticatedTestSession,
  createVerifiedMfaTestSession,
  hasCurrentAdministratorRole,
} from '../authenticated-session.mts'
import type { FeatureFlags } from '../../services/feature-flags/index.mts'
import {
  listenOnLoopbackEphemeralPort,
  type LoopbackHost,
} from 'vouchington-tooling/runner-port-policy'
import { recordServerErrorResponse } from './server-error-responses.mts'
import { profileRequestQueries } from './request-query-profile.mts'
import { withOwnedApiServer } from '../api-query-options-server.mts'

type ApiTestListener = ReturnType<typeof createApiRequestGuardedListener>
type ApiTestServerAddress = { host: LoopbackHost; port: number }

type ApiTestServerState = {
  server: http.Server
  addressPromise: Promise<ApiTestServerAddress>
}

const API_TEST_SERVER_STATE_KEY = '__vouchaApiTestServerState'
const API_TEST_SERVER_LISTENER_KEY = '__vouchaApiTestServerListener'
const API_TEST_SERVER_MATCHER_KEY = '__vouchaApiTestServerMatcher'

type ApiTestServerGlobal = typeof globalThis & {
  [API_TEST_SERVER_STATE_KEY]?: ApiTestServerState
  [API_TEST_SERVER_LISTENER_KEY]?: ApiTestListener
  [API_TEST_SERVER_MATCHER_KEY]?: typeof fn
}

const { host: serverHost, port: serverPort } = await sharedApiTestServerAddress()
export const apiTestServerPort = serverPort
const testRequestIpState = globalThis as typeof globalThis & {
  vouchaTestRequestIpCounter?: number
}

// Extend the supertest agent with authentication helper
export interface AuthenticatedAgent extends supertest.Agent {
  authenticateAs: (user: PrivateUser) => Promise<void>
  authenticateAsRaw: (user: PrivateUser) => Promise<void>
  authenticateAsMfa: (user: PrivateUser) => Promise<void>
  setFeatureFlags: (overrides: FeatureFlags) => void
  authCookie: string
  featureFlagCookie: string
  did: string
  sid: string
  setClientInfo: (headers: Partial<Record<string, string>>) => void
}

export const createRequest = (
  address: ApiTestServerAddress = { host: serverHost, port: serverPort },
): AuthenticatedAgent => {
  const requestUrlHost = address.host === '::1' ? '[::1]' : address.host
  const agent = supertest.agent(`http://${requestUrlHost}:${address.port}`) as AuthenticatedAgent
  agent.authCookie = ''
  agent.featureFlagCookie = ''
  agent.set('x-forwarded-for', nextTestRequestIp())
  agent.set('x-voucha-client', 'web')
  agent.set('x-voucha-platform', 'web')
  agent.set('x-voucha-app-version', 'test')
  agent.use((request: supertest.Test) => {
    request.on('response', (response: supertest.Response) =>
      recordServerErrorResponse(request, response),
    )
  })
  agent.setClientInfo = function (headers) {
    for (const [name, value] of Object.entries(headers)) this.set(name, value)
  }

  if (process.env.CF_WORKER_SECRET) {
    agent.set('x-cf-worker-secret', process.env.CF_WORKER_SECRET)
  }

  function syncCookieHeader(request: AuthenticatedAgent): void {
    const cookies = [request.authCookie, request.featureFlagCookie].filter(Boolean)
    if (cookies.length > 0) {
      request.set('Cookie', cookies.join('; '))
      request.set('Sec-Fetch-Site', 'same-origin')
    }
  }

  function setAuthTokens(
    request: AuthenticatedAgent,
    tokens: Awaited<ReturnType<typeof createAuthenticatedTestSession>>,
  ) {
    const { deviceToken, sessionToken } = tokens
    const did = deviceToken.payload.did
    const cookies = [`dt=${deviceToken.token}`, `st=${sessionToken.token}`]
    request.did = did
    request.sid = sessionToken.payload.sid
    request.authCookie = cookies.join('; ')
    request.jar.setCookies(cookies, address.host, '/')
    syncCookieHeader(request)
  }

  agent.authenticateAs = async function (user: PrivateUser) {
    if (await hasCurrentAdministratorRole(user.id)) return this.authenticateAsMfa(user)
    return this.authenticateAsRaw(user)
  }

  agent.authenticateAsRaw = async function (user: PrivateUser) {
    setAuthTokens(this, await createAuthenticatedTestSession(user))
  }

  agent.authenticateAsMfa = async function (user: PrivateUser) {
    setAuthTokens(this, await createVerifiedMfaTestSession(user.id))
  }

  agent.setFeatureFlags = function (overrides: FeatureFlags) {
    const encoded = Buffer.from(JSON.stringify(overrides)).toString('base64')
    this.featureFlagCookie = `ff=${encoded}`
    this.jar.setCookies([this.featureFlagCookie], address.host, '/')
    syncCookieHeader(this)
  }

  return agent
}

export const request = createRequest()

export function nextTestRequestIp(): string {
  testRequestIpState.vouchaTestRequestIpCounter =
    (testRequestIpState.vouchaTestRequestIpCounter ?? 0) + 1
  return formatTestRequestIp(process.pid, testRequestIpState.vouchaTestRequestIpCounter)
}

export function formatTestRequestIp(processId: number, counter: number): string {
  return `2001:db8:${formatIpv6Segment(processId >>> 16)}:${formatIpv6Segment(processId)}::${formatIpv6Segment(counter >>> 16)}:${formatIpv6Segment(counter)}`
}

function sharedApiTestServerAddress(): Promise<ApiTestServerAddress> {
  const state = globalThis as ApiTestServerGlobal
  state[API_TEST_SERVER_LISTENER_KEY] = createApiRequestGuardedListener(fn.callback())
  state[API_TEST_SERVER_MATCHER_KEY] = fn
  state[API_TEST_SERVER_STATE_KEY] ??= createSharedApiTestServer(state)
  // A rejected addressPromise (e.g. transient bind failure) would otherwise stay cached forever,
  // permanently failing every subsequent test in this fork. Clear the cached state on rejection
  // so the next call retries with a fresh listen attempt.
  return state[API_TEST_SERVER_STATE_KEY].addressPromise.catch(err => {
    state[API_TEST_SERVER_STATE_KEY] = undefined
    throw err
  })
}

function createSharedApiTestServer(state: ApiTestServerGlobal): ApiTestServerState {
  const testServer = http.createServer((req, res) =>
    profileRequestQueries(
      req,
      res,
      () => state[API_TEST_SERVER_LISTENER_KEY]?.(req, res),
      state[API_TEST_SERVER_MATCHER_KEY]!,
    ),
  )
  testServer.keepAliveTimeout = 30_000
  // IPv6 loopback avoids macOS IPv4 port exhaustion; bind falls back to IPv4 where needed.
  // Await listening so the address is known before tests import this module.
  const addressPromise = listenOnLoopbackEphemeralPort(testServer).then(address => {
    // Surface post-bind server errors immediately instead of emitting an unhandled event.
    testServer.on('error', err => {
      throw err
    })
    return address
  })
  return { server: testServer, addressPromise }
}

function formatIpv6Segment(value: number): string {
  return (value & 0xffff).toString(16)
}

/** Real HTTP dispatch; the caller retains inherited transaction ownership. */
export async function withApiRequestQueryOptions<Result>(
  options: QueryOptions & { now?: Date },
  run: (request: AuthenticatedAgent) => Promise<Result>,
): Promise<Result> {
  const listener = createRequestQueryOptionsListener(
    createApiRequestGuardedListener(fn.callback()),
    options,
  )
  return withOwnedApiServer(listener, fn, address => run(createRequest(address)))
}
