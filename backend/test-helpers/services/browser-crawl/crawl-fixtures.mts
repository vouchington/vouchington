import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { onTestFinished, vi } from 'vitest'

const CSR_HYDRATION_WAIT_MS = 5_000

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

/** Points the adblocker disk cache at a private temp dir; call before importing the crawl modules. */
export async function useAdblockerCachePath({ unwritable = false } = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adblocker-cache-'))
  const cachePath = path.join(
    cacheDir,
    ...(unwritable ? ['missing-dir'] : []),
    'adblocker-engine.bin',
  )
  vi.stubEnv('ADBLOCKER_CACHE_PATH', cachePath)
  onTestFinished(async () => {
    vi.unstubAllEnvs()
    await fs.rm(cacheDir, { recursive: true, force: true })
  })
  return cachePath
}

/**
 * Runs the post-load CSR hydration wait immediately and records the delay production requested.
 * Every other timer is untouched.
 */
export function skipHydrationWait() {
  const delays: number[] = []
  const realSetTimeout = globalThis.setTimeout
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    if (delay === CSR_HYDRATION_WAIT_MS) {
      delays.push(delay)
      return realSetTimeout(callback, 0)
    }
    return Reflect.apply(realSetTimeout, globalThis, [callback, delay, ...args])
  }) as typeof setTimeout)
  onTestFinished(() => spy.mockRestore())
  return delays
}
