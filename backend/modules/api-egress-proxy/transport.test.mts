import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  closeApiEgressProxyTransport,
  getApiEgressProxyUrl,
  getProviderFetch,
  getProviderRequestDispatcher,
  installApiEgressProxyRoutingResolver,
  resetApiEgressProxyTransportForTest,
} from './transport.mts'
import { getExternalRequestDispatcher } from '@modules/utils'

describe('API egress proxy transport', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await resetApiEgressProxyTransportForTest()
  })

  it('uses the guarded direct dispatcher while no API resolver is installed', () => {
    expect(getProviderRequestDispatcher('stripe_enabled')).toBe(getExternalRequestDispatcher())
  })

  it('reads an installed provider resolver at request time', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    let enabled = false
    installApiEgressProxyRoutingResolver(() => enabled)
    const directDispatcher = getProviderRequestDispatcher('stripe_enabled')
    expect(directDispatcher).toBe(getExternalRequestDispatcher())

    enabled = true
    const proxyDispatcher = getProviderRequestDispatcher('stripe_enabled')
    expect(proxyDispatcher).not.toBe(directDispatcher)

    enabled = false
    expect(getProviderRequestDispatcher('stripe_enabled')).toBe(directDispatcher)
  })

  it('keeps routine and long-running proxy pools separate', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    installApiEgressProxyRoutingResolver(() => true)

    const routine = getProviderRequestDispatcher('stripe_enabled')
    const longRunning = getProviderRequestDispatcher('openai_moderation_enabled', 'long-running')

    expect(longRunning).not.toBe(routine)
    expect(getProviderRequestDispatcher('stripe_enabled')).toBe(routine)
    expect(getProviderRequestDispatcher('openai_moderation_enabled', 'long-running')).toBe(
      longRunning,
    )
  })

  it('routes proxy-selected fetches through undici without a direct retry', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://127.0.0.1:1')
    installApiEgressProxyRoutingResolver(() => true)

    const fetchThroughProxy = getProviderFetch('github_oauth_enabled')
    await expect(
      fetchThroughProxy('https://example.com', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('fails closed when a proxy-selected provider has no valid proxy URL', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', '')
    installApiEgressProxyRoutingResolver(() => true)
    expect(() => getProviderRequestDispatcher('stripe_enabled')).toThrow(
      'API_EGRESS_PROXY_URL is required when API egress proxying is enabled',
    )
  })

  it('rejects path-bearing proxy URLs', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128/tunnel')
    expect(() => getApiEgressProxyUrl()).toThrow(
      'API_EGRESS_PROXY_URL must be an unauthenticated http URL',
    )
  })

  it('rejects malformed proxy URLs', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'not a URL')
    expect(() => getApiEgressProxyUrl()).toThrow('API_EGRESS_PROXY_URL must be a valid http URL')
  })

  it('requires the Service Connect authority in deployed environments', () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://other-proxy:3128')
    expect(() => getApiEgressProxyUrl()).toThrow(
      'API_EGRESS_PROXY_URL must use the api-egress-proxy:3128 Service Connect endpoint in deployed environments',
    )
  })

  it('closes every proxy pool once and shares concurrent close work', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    installApiEgressProxyRoutingResolver(() => true)
    const routineDispatcher = getProviderRequestDispatcher('stripe_enabled')
    const longRunningDispatcher = getProviderRequestDispatcher(
      'openai_moderation_enabled',
      'long-running',
    )
    const routineClose = vi.spyOn(routineDispatcher, 'close')
    const longRunningClose = vi.spyOn(longRunningDispatcher, 'close')

    // undici's DispatcherBase#close(callback) is itself a promise-wrapper that recurses into
    // `this.close(callback)` once with a callback argument to resolve the returned promise, so
    // every real close request shows up twice in the spy's call log. Filter to the zero-argument
    // (promise-form) invocations — those are the only calls our own code makes — to check that
    // two concurrent callers dedupe onto the same in-flight close instead of each independently
    // triggering their own Promise.all(...).close() over the pools.
    const outerCallCount = (spy: typeof routineClose) =>
      spy.mock.calls.filter(args => args.length === 0).length
    await Promise.all([closeApiEgressProxyTransport(), closeApiEgressProxyTransport()])

    expect(outerCallCount(routineClose)).toBe(1)
    expect(outerCallCount(longRunningClose)).toBe(1)
  })
})
