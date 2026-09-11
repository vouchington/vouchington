import { describe, expect, it, vi } from 'vitest'
import type { BrowserContext, Route } from '@playwright/test'
import {
  BLOCKED_EXTERNAL_NETWORK_RULES,
  BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST,
  installBlockedExternalNetwork,
  isBlockedExternalNetworkUrl,
} from '../blocked-external-network.mts'

type RouteHandler = (route: Route) => Promise<unknown> | unknown

function createContext() {
  const routes: { handler: RouteHandler; pattern: RegExp }[] = []
  const context = {
    route: vi.fn<(...args: Array<never>) => unknown>((pattern: RegExp, handler: RouteHandler) => {
      routes.push({ handler, pattern })
      return Promise.resolve()
    }),
  } as unknown as BrowserContext
  return { context, routes }
}

function createRoute() {
  return {
    fulfill: vi.fn<(...args: Array<never>) => unknown>(async () => {}),
  } as unknown as Route & { fulfill: ReturnType<typeof vi.fn> }
}

describe('blocked external network', () => {
  it('installs routes for every blocked telemetry rule', async () => {
    const { context, routes } = createContext()

    await installBlockedExternalNetwork(context)

    expect(routes).toHaveLength(BLOCKED_EXTERNAL_NETWORK_RULES.length)
  })

  it('fulfills GTM scripts with deterministic no-op JavaScript', async () => {
    const { context, routes } = createContext()
    await installBlockedExternalNetwork(context)

    const gtmRoute = routes.find(route => route.pattern.test('https://g.voucha.ai/gtm.js?id=GTM-X'))
    expect(gtmRoute).toBeDefined()

    const route = createRoute()
    await gtmRoute?.handler(route)

    expect(route.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('window.dataLayer'),
        contentType: 'application/javascript',
        status: 200,
      }),
    )
  })

  it('fulfills analytics collection requests with 204', async () => {
    const { context, routes } = createContext()
    await installBlockedExternalNetwork(context)

    const collectRoute = routes.find(route =>
      route.pattern.test('https://www.google-analytics.com/g/collect?v=2'),
    )
    expect(collectRoute).toBeDefined()

    const route = createRoute()
    await collectRoute?.handler(route)

    expect(route.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 204,
      }),
    )
  })

  it('matches only known telemetry URLs', () => {
    expect(isBlockedExternalNetworkUrl('https://www.googletagmanager.com/gtm.js?id=GTM-X')).toBe(
      true,
    )
    expect(isBlockedExternalNetworkUrl('https://www.google-analytics.com/collect?v=1')).toBe(true)
    expect(isBlockedExternalNetworkUrl('https://example.com/app.js')).toBe(false)
  })

  it('exports request-failure allowlist entries with reasons', () => {
    expect(BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST.length).toBeGreaterThanOrEqual(
      BLOCKED_EXTERNAL_NETWORK_RULES.length,
    )
    for (const entry of BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST) {
      expect(entry.type).toBe('requestfailed')
      expect(entry.reason).not.toHaveLength(0)
    }
  })

  it('includes allowlist entry for local image lambda ORB failures', () => {
    const entry = BLOCKED_EXTERNAL_REQUEST_FAILURE_ALLOWLIST.find(e =>
      e.pattern.test('http://localhost:64703/images/abc123'),
    )
    expect(entry).toBeDefined()
    expect(entry?.type).toBe('requestfailed')
  })
})
