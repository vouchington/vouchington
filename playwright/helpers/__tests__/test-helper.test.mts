import { describe, expect, it, vi } from 'vitest'
import type { Browser, BrowserContext, Page, Request, Route, TestInfo } from '@playwright/test'
import { browserErrorsFixture, withMonitoredPage } from '../test.mts'

type Listener = (...args: unknown[]) => void

class MockBrowserContext {
  readonly contextPages: Page[] = []
  readonly listeners = new Map<string, Set<Listener>>()

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  pages() {
    return this.contextPages
  }

  route = vi.fn<(...args: Array<never>) => unknown>(
    (_pattern: RegExp, _handler: (route: Route) => unknown) => Promise.resolve(),
  )
}

function createTestInfo(
  overrides: Partial<{
    expectedStatus: TestInfo['expectedStatus']
    status: TestInfo['status']
  }> = {},
) {
  return {
    attach: vi.fn<(...args: Array<never>) => unknown>(() => Promise.resolve()),
    expectedStatus: overrides.expectedStatus ?? 'passed',
    status: overrides.status ?? 'passed',
  } as unknown as TestInfo
}

function createRequest(failureText = 'net::ERR_ABORTED') {
  return {
    failure: () => ({ errorText: failureText }),
    frame: () => ({ url: () => 'http://localhost:8787/' }),
    method: () => 'GET',
    resourceType: () => 'script',
    url: () => 'http://localhost:8787/late.js',
  } as unknown as Request
}

function createBrowser(page: Page) {
  return {
    newPage: vi.fn<(...args: Array<never>) => unknown>(() => Promise.resolve(page)),
  } as unknown as Browser
}

function createPage(context: MockBrowserContext) {
  const listeners = new Map<string, Set<Listener>>()
  const page = {
    close: vi.fn<(...args: Array<never>) => unknown>(() => {
      for (const listener of listeners.get('close') ?? []) {
        listener()
      }
      return Promise.resolve()
    }),
    context: () => context as unknown as BrowserContext,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(...args)
      }
    },
    off: (event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener)
      return page
    },
    on: (event: string, listener: Listener) => {
      const eventListeners = listeners.get(event) ?? new Set<Listener>()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
      return page
    },
    url: () => 'http://localhost:8787/extra',
  } as unknown as Page
  context.contextPages.push(page)
  return page
}

describe('withMonitoredPage', () => {
  it('ignores request failures caused by closing the extra page', async () => {
    const context = new MockBrowserContext()
    const page = createPage(context)
    vi.mocked(page.close).mockImplementationOnce(() => {
      context.emit('requestfailed', createRequest())
      return Promise.resolve()
    })

    await expect(
      withMonitoredPage(createBrowser(page), createTestInfo(), () => Promise.resolve('ok')),
    ).resolves.toBe('ok')

    expect(page.close).toHaveBeenCalledOnce()
  })

  it('fails when the extra page emits an unhandled web error', async () => {
    const context = new MockBrowserContext()
    const page = createPage(context)

    await expect(
      withMonitoredPage(createBrowser(page), createTestInfo(), extraPage => {
        context.emit('weberror', {
          error: () => new Error('extra page exploded'),
          page: () => extraPage,
        })
        return Promise.resolve()
      }),
    ).rejects.toThrow(/Unhandled browser issue detected/)

    expect(page.close).toHaveBeenCalledOnce()
  })

  it('fails when the extra page crashes', async () => {
    const context = new MockBrowserContext()
    const page = createPage(context)

    await expect(
      withMonitoredPage(createBrowser(page), createTestInfo(), extraPage => {
        const crashablePage = extraPage as unknown as { emit: (event: string) => void }
        crashablePage.emit('crash')
        return Promise.resolve()
      }),
    ).rejects.toThrow(/pagecrash/)

    expect(page.close).toHaveBeenCalledOnce()
  })

  it('closes the extra page when setup fails', async () => {
    const context = new MockBrowserContext()
    const page = createPage(context)
    context.route.mockRejectedValueOnce(new Error('route setup failed'))

    await expect(
      withMonitoredPage(createBrowser(page), createTestInfo(), () => Promise.resolve('unused')),
    ).rejects.toThrow(/route setup failed/)

    expect(page.close).toHaveBeenCalledOnce()
    expect(context.listeners.get('console')?.size ?? 0).toBe(0)
    expect(context.listeners.get('dialog')?.size ?? 0).toBe(0)
    expect(context.listeners.get('page')?.size ?? 0).toBe(0)
    expect(context.listeners.get('weberror')?.size ?? 0).toBe(0)
    expect(context.listeners.get('requestfailed')?.size ?? 0).toBe(0)
  })

  it('can create a monitored page from an existing browser context', async () => {
    const context = new MockBrowserContext()
    const page = createPage(context)
    const contextWithNewPage = Object.assign(context, {
      newPage: vi.fn<(...args: Array<never>) => unknown>(() => Promise.resolve(page)),
    })

    await expect(
      withMonitoredPage(contextWithNewPage as unknown as BrowserContext, createTestInfo(), () =>
        Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok')

    expect(contextWithNewPage.newPage).toHaveBeenCalledOnce()
    expect(page.close).toHaveBeenCalledOnce()
  })
})

describe('browserErrorsFixture', () => {
  it('fails passing tests that emit unhandled browser errors', async () => {
    const context = new MockBrowserContext()
    const testInfo = createTestInfo()

    await expect(
      browserErrorsFixture(
        { context: context as unknown as BrowserContext },
        () => {
          context.emit('weberror', {
            error: () => new Error('fixture page exploded'),
            page: () => ({ url: () => 'http://localhost:8787/fixture' }),
          })
          return Promise.resolve()
        },
        testInfo,
      ),
    ).rejects.toThrow(/Unhandled browser issue detected/)

    expect(testInfo.attach).toHaveBeenCalledOnce()
    expect(context.listeners.get('console')?.size).toBe(0)
    expect(context.listeners.get('dialog')?.size).toBe(0)
    expect(context.listeners.get('page')?.size).toBe(0)
    expect(context.listeners.get('weberror')?.size).toBe(0)
    expect(context.listeners.get('requestfailed')?.size).toBe(0)
  })

  it('attaches browser errors instead of masking an already failed test', async () => {
    const context = new MockBrowserContext()
    const testInfo = createTestInfo({ expectedStatus: 'passed', status: 'failed' })

    await expect(
      browserErrorsFixture(
        { context: context as unknown as BrowserContext },
        () => {
          context.emit('requestfailed', createRequest('net::ERR_CONNECTION_RESET'))
          return Promise.resolve()
        },
        testInfo,
      ),
    ).resolves.toBeUndefined()

    expect(testInfo.attach).toHaveBeenCalledOnce()
  })

  it('attaches browser errors and rethrows callback failures', async () => {
    const context = new MockBrowserContext()
    const testInfo = createTestInfo()
    const callbackError = new Error('test body failed')

    await expect(
      browserErrorsFixture(
        { context: context as unknown as BrowserContext },
        () => {
          context.emit('weberror', {
            error: () => new Error('captured before callback failed'),
            page: () => null,
          })
          return Promise.reject(callbackError)
        },
        testInfo,
      ),
    ).rejects.toThrow(callbackError)

    expect(testInfo.attach).toHaveBeenCalledOnce()
    expect(context.listeners.get('console')?.size).toBe(0)
    expect(context.listeners.get('page')?.size).toBe(0)
    expect(context.listeners.get('weberror')?.size).toBe(0)
  })
})
