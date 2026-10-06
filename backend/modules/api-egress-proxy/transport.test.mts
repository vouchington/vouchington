import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApiEgressProxyTransport, getApiEgressProxyUrl } from './transport.mts'
import { createHttpDispatchers } from '@modules/utils'

describe('API egress proxy transport', () => {
  let direct: ReturnType<typeof createHttpDispatchers>
  let transport: ReturnType<typeof createApiEgressProxyTransport>

  beforeEach(() => {
    direct = createHttpDispatchers()
    transport = createApiEgressProxyTransport(direct)
  })

  afterEach(async () => {
    try {
      await transport[Symbol.asyncDispose]()
    } finally {
      await direct[Symbol.asyncDispose]()
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
    }
  })

  it('uses the guarded direct dispatcher while no API resolver is installed', () => {
    expect(transport.getProviderRequestDispatcher('stripe_enabled')).toBe(
      direct.getExternalRequestDispatcher(),
    )
  })

  it('reads an installed provider resolver at request time', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    let enabled = false
    transport.installApiEgressProxyRoutingResolver(() => enabled)
    const directDispatcher = transport.getProviderRequestDispatcher('stripe_enabled')
    expect(directDispatcher).toBe(direct.getExternalRequestDispatcher())

    enabled = true
    const proxyDispatcher = transport.getProviderRequestDispatcher('stripe_enabled')
    expect(proxyDispatcher).not.toBe(directDispatcher)

    enabled = false
    expect(transport.getProviderRequestDispatcher('stripe_enabled')).toBe(directDispatcher)
  })

  it('keeps a held fetch lazy and re-evaluates routing on every call', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', '')
    const providerFetch = transport.getProviderFetch('stripe_enabled')
    expect(() => transport.getProviderRequestDispatcher('stripe_enabled')).not.toThrow()
    transport.installApiEgressProxyRoutingResolver(() => true)
    await expect(
      providerFetch('https://example.com', { signal: AbortSignal.abort() }),
    ).rejects.toThrow('API_EGRESS_PROXY_URL is required when API egress proxying is enabled')
    transport.installApiEgressProxyRoutingResolver(() => false)
    await expect(
      providerFetch('https://example.com', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('keeps routine and long-running proxy pools separate', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    transport.installApiEgressProxyRoutingResolver(() => true)

    const routine = transport.getProviderRequestDispatcher('stripe_enabled')
    const longRunning = transport.getProviderRequestDispatcher(
      'openai_moderation_enabled',
      'long-running',
    )

    expect(longRunning).not.toBe(routine)
    expect(transport.getProviderRequestDispatcher('stripe_enabled')).toBe(routine)
    expect(
      transport.getProviderRequestDispatcher('openai_moderation_enabled', 'long-running'),
    ).toBe(longRunning)
  })

  it('disposes one proxy owner without closing another or clearing its resolver', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    await using other = createApiEgressProxyTransport(direct)
    other.installApiEgressProxyRoutingResolver(() => true)
    const dispatcher = other.getProviderRequestDispatcher('stripe_enabled')
    const close = vi.spyOn(dispatcher, 'close')
    try {
      await transport[Symbol.asyncDispose]()
      expect(close).not.toHaveBeenCalled()
      expect(other.getProviderRequestDispatcher('stripe_enabled')).toBe(dispatcher)
      expect(other.isApiEgressProxyRouteEnabled('stripe_enabled')).toBe(true)
    } finally {
      close.mockRestore()
    }
  })

  it('routes proxy-selected fetches through undici without a direct retry', async () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://127.0.0.1:1')
    transport.installApiEgressProxyRoutingResolver(() => true)

    const fetchThroughProxy = transport.getProviderFetch('github_oauth_enabled')
    await expect(
      fetchThroughProxy('https://example.com', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('fails closed when a proxy-selected provider has no valid proxy URL', () => {
    vi.stubEnv('API_EGRESS_PROXY_URL', '')
    transport.installApiEgressProxyRoutingResolver(() => true)
    expect(() => transport.getProviderRequestDispatcher('stripe_enabled')).toThrow(
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
    transport.installApiEgressProxyRoutingResolver(() => true)
    const routineDispatcher = transport.getProviderRequestDispatcher('stripe_enabled')
    const longRunningDispatcher = transport.getProviderRequestDispatcher(
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
    await Promise.all([
      transport.closeApiEgressProxyTransport(),
      transport.closeApiEgressProxyTransport(),
    ])

    expect(outerCallCount(routineClose)).toBe(1)
    expect(outerCallCount(longRunningClose)).toBe(1)
  })
})
