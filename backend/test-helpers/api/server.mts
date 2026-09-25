import supertest from 'supertest'
import fn, { createApiRequestGuardedListener } from '../../api/app.mts'
// Register this package's v1 routes on the shared app singleton. Route
// packages outside @voucha/api (rss, md, entrypoint infra) register their own
// routes from their own test files to avoid dependency cycles.
import '../../api/index.mts'
import http from 'node:http'
import type { PrivateUser } from '../../services/users/types.mts'
import { createDeviceAndSessionTokens } from '../../services/jwt-session/index.mts'
import { encodeFeatureFlagCookie, type FeatureFlags } from '../../services/feature-flags/index.mts'
import { v7 } from 'uuid'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { recordServerErrorResponse } from './server-error-responses.mts'

type ApiTestListener = ReturnType<typeof createApiRequestGuardedListener>

type ApiTestServerState = {
  server: http.Server
  portPromise: Promise<number>
}

const API_TEST_SERVER_STATE_KEY = '__vouchaApiTestServerState'
const API_TEST_SERVER_LISTENER_KEY = '__vouchaApiTestServerListener'

type ApiTestServerGlobal = typeof globalThis & {
  [API_TEST_SERVER_STATE_KEY]?: ApiTestServerState
  [API_TEST_SERVER_LISTENER_KEY]?: ApiTestListener
}

// Exercise api-server's media-type enforcement and the client-information listener guard without
// adding the origin guard: route tests intentionally construct cookie-authenticated requests
// directly, while the dedicated origin-guard suites own browser-origin coverage.
const serverPort = await sharedApiTestServerPort()
export const apiTestServerPort = serverPort
const testRequestIpState = globalThis as typeof globalThis & {
  vouchaTestRequestIpCounter?: number
}

// Extend the supertest agent with authentication helper
interface AuthenticatedAgent extends supertest.Agent {
  authenticateAs: (user: PrivateUser) => Promise<void>
  setFeatureFlags: (overrides: FeatureFlags) => void
  /** The raw cookie string set by authenticateAs; useful for combining with additional cookies */
  authCookie: string
  featureFlagCookie: string
  /** The `did` minted by the most recent `authenticateAs` call. */
  did: string
  /** The `sid` minted by the most recent `authenticateAs` call. */
  sid: string
  setClientInfo: (headers: Partial<Record<string, string>>) => void
}

export const createRequest = (): AuthenticatedAgent => {
  // Use the IPv6 URL string directly so supertest never falls back to its
  // hardcoded 127.0.0.1 URL (in supertest/lib/test.js Test.serverAddress()).
  const agent = supertest.agent(`http://[::1]:${serverPort}`) as AuthenticatedAgent
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

  // Set the CF Worker secret header so requests pass origin validation.
  // In production, the Cloudflare Worker adds this header; in tests we bypass
  // the worker and hit the backend directly, so we must add it ourselves.
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

  // Add authentication helper method
  agent.authenticateAs = async function (user: PrivateUser) {
    const did = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, uid: user.id })
    const cookies = [`dt=${deviceToken.token}`, `st=${sessionToken.token}`]

    this.did = did
    this.sid = sessionToken.payload.sid
    // Set cookies for all subsequent requests
    this.authCookie = cookies.join('; ')
    this.jar.setCookies(cookies, '::1', '/')
    syncCookieHeader(this)
  }

  agent.setFeatureFlags = function (overrides: FeatureFlags) {
    const encoded = encodeFeatureFlagCookie(overrides)
    this.featureFlagCookie = `ff=${encoded}`
    this.jar.setCookies([this.featureFlagCookie], '::1', '/')
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

function sharedApiTestServerPort(): Promise<number> {
  const state = globalThis as ApiTestServerGlobal
  // `vi.resetModules()` re-evaluates this module and `@voucha/api/app`, producing a
  // new `app` singleton (with its own routes, e.g. test-local routes registered by
  // callers like error-handler.routes.test.mts). Repoint the dispatch target on every
  // evaluation so the one persistent per-fork server never keeps forwarding to a
  // stale pre-reset app.
  state[API_TEST_SERVER_LISTENER_KEY] = createApiRequestGuardedListener(fn.callback())
  state[API_TEST_SERVER_STATE_KEY] ??= createSharedApiTestServer(state)
  // A rejected portPromise (e.g. transient bind failure) would otherwise stay cached forever,
  // permanently failing every subsequent test in this fork. Clear the cached state on rejection
  // so the next call retries with a fresh listen attempt.
  return state[API_TEST_SERVER_STATE_KEY].portPromise.catch(err => {
    state[API_TEST_SERVER_STATE_KEY] = undefined
    throw err
  })
}

function createSharedApiTestServer(state: ApiTestServerGlobal): ApiTestServerState {
  const testServer = http.createServer((req, res) =>
    state[API_TEST_SERVER_LISTENER_KEY]?.(req, res),
  )
  testServer.keepAliveTimeout = 30_000
  // Listen on IPv6 loopback (::1) — macOS has a kernel-level limit on concurrent
  // TCP connections to 127.0.0.1 that causes EADDRNOTAVAIL under parallel test load
  // (e.g. 8 fork workers × multiple test files running simultaneously). ::1 does not
  // have this restriction. We await the 'listening' event so the port is known before
  // the module's exports are used by any test.
  const portPromise = listenOnEphemeralPort(testServer, '::1').then(port => {
    // Surface post-bind server errors immediately instead of emitting an unhandled event.
    testServer.on('error', err => {
      throw err
    })
    return port
  })
  return { server: testServer, portPromise }
}

function formatIpv6Segment(value: number): string {
  return (value & 0xffff).toString(16)
}
