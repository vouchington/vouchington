import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getApiEgressProxyUrl,
  getProviderRequestDispatcher,
  installApiEgressProxyRoutingResolver,
} from './transport.mts'

describe('API egress proxy transport', () => {
  afterEach(() => {
    installApiEgressProxyRoutingResolver(undefined)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
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

  it('accepts the Service Connect authority in deployed environments', () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('API_EGRESS_PROXY_URL', 'http://api-egress-proxy:3128')
    expect(getApiEgressProxyUrl()).toBe('http://api-egress-proxy:3128/')
  })
})
