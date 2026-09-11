import { vi } from 'vitest'

export const mockConnectOverCDP = vi.fn<VitestLooseMock>()
export const mockReadFile = vi.fn<VitestLooseMock>()
export const mockWriteFile = vi.fn<VitestLooseMock>()
export const mockRename = vi.fn<VitestLooseMock>()
export const mockUnlink = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
export const mockDeserialize = vi.fn<VitestLooseMock>()
export const mockFromPrebuiltAdsAndTracking = vi.fn<VitestLooseMock>()
export const mockBlockerSerialize = vi.fn<VitestLooseMock>()
export const mockEnableBlockingInPage = vi.fn<VitestLooseMock>()
export const mockAssertSafeUrlSync = vi.fn<VitestLooseMock>()

export function makeMockRoute(url: string, isNavigationRequest = false) {
  return {
    request: () => ({ url: () => url, isNavigationRequest: () => isNavigationRequest }),
    continue: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    abort: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    fallback: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  }
}

export function makeMockWebSocketRoute(url: string) {
  return {
    url: () => url,
    close: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    connectToServer: vi.fn<VitestLooseMock>(),
  }
}

export function makeMockPage(overrides: Record<string, unknown> = {}) {
  // Playwright resolves page.route() handlers LIFO: only the most-recently
  // registered handler runs, and it must call continue()/abort()/fulfill() or
  // fallback() to hand off. fireRoute() mirrors that by invoking the last one.
  const routeHandlers: Array<(route: unknown) => unknown> = []
  const webSocketRouteHandlers: Array<(ws: unknown) => unknown> = []
  return {
    route: vi.fn<VitestLooseMock>((_pattern: string, handler: (route: unknown) => unknown) => {
      routeHandlers.push(handler)
    }),
    _routeHandlers: routeHandlers,
    fireRoute: (route: unknown) => routeHandlers.at(-1)?.(route),
    routeWebSocket: vi.fn<VitestLooseMock>(
      (_pattern: string, handler: (ws: unknown) => unknown) => {
        webSocketRouteHandlers.push(handler)
      },
    ),
    _webSocketRouteHandlers: webSocketRouteHandlers,
    fireWebSocketRoute: (ws: unknown) => webSocketRouteHandlers.at(-1)?.(ws),
    setDefaultTimeout: vi.fn<VitestLooseMock>(),
    goto: vi.fn<VitestLooseMock>().mockResolvedValue({ status: () => 200 }),
    url: vi.fn<VitestLooseMock>().mockReturnValue('https://example.com'),
    evaluate: vi.fn<VitestLooseMock>().mockResolvedValue({
      contentLength: 100,
      html: '<html><body>Hello</body></html>',
      title: 'Test Title',
    }),
    close: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function makeMockContext(page: ReturnType<typeof makeMockPage>) {
  return {
    newPage: vi.fn<VitestLooseMock>().mockResolvedValue(page),
    close: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  }
}

export function makeMockBrowser(page: ReturnType<typeof makeMockPage>) {
  const context = makeMockContext(page)
  return {
    newContext: vi.fn<VitestLooseMock>().mockResolvedValue(context),
    close: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
    mockContext: context,
  }
}

export function resetCrawlMocks(resetForTesting: () => void) {
  vi.clearAllMocks()
  resetForTesting()
  mockReadFile.mockRejectedValue(new Error('ENOENT'))
  const blockerInstance = {
    serialize: mockBlockerSerialize.mockReturnValue(Buffer.from('data')),
    enableBlockingInPage: mockEnableBlockingInPage.mockResolvedValue(undefined),
  }
  mockFromPrebuiltAdsAndTracking.mockResolvedValue(blockerInstance)
  mockDeserialize.mockReturnValue(blockerInstance)
  mockWriteFile.mockResolvedValue(undefined)
  mockRename.mockResolvedValue(undefined)
  mockUnlink.mockResolvedValue(undefined)
}

export function getCrawlTestDependencies() {
  return {
    connect: mockConnectOverCDP,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    rename: mockRename,
    unlink: mockUnlink,
    deserializeBlocker: mockDeserialize,
    fromPrebuiltAdsAndTracking: mockFromPrebuiltAdsAndTracking,
    assertSafeUrlSync: mockAssertSafeUrlSync,
    csrHydrationWaitMs: 0,
  }
}
