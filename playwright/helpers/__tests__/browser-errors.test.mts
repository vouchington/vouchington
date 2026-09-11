import { describe, expect, it, vi } from 'vitest'

import type { BrowserContext, Page, Request, TestInfo } from '@playwright/test'

import { BrowserIssueMonitor } from '../browser-errors.mts'

type Listener = (...args: never[]) => void

class MockBrowserContext {
  readonly listeners = new Map<string, Set<Listener>>()

  emit(event: string, ...args: never[]) {
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
    return []
  }
}

function createTestInfo() {
  const attachments: { body: Buffer; contentType: string; name: string }[] = []
  const testInfo = {
    attach: vi.fn<(...args: Array<never>) => unknown>(
      (name: string, options: { body: Buffer; contentType: string }) => {
        attachments.push({ name, ...options })
        return Promise.resolve()
      },
    ),
  } as unknown as TestInfo
  return { attachments, testInfo }
}

function createPage(url = 'http://localhost:8787/path') {
  return {
    url: () => url,
  } as Page
}

function createRequest(
  overrides: Partial<{
    failureText: null | string
    frameThrows: boolean
    frameUrl: string
    method: string
    resourceType: string
    url: string
  }> = {},
) {
  const {
    failureText = 'net::ERR_FAILED',
    frameThrows = false,
    frameUrl = 'http://localhost:8787/frame',
    method = 'GET',
    resourceType = 'script',
    url = 'https://example.com/script.js',
  } = overrides

  return {
    failure: () => (failureText === null ? null : { errorText: failureText }),
    frame: () => {
      if (frameThrows) throw new Error('frame unavailable')
      return { url: () => frameUrl }
    },
    method: () => method,
    resourceType: () => resourceType,
    url: () => url,
  } as unknown as Request
}

describe('BrowserIssueMonitor', () => {
  it('fails with an attachment for unhandled browser exceptions', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    const error = new Error('render failed')
    error.stack = undefined
    context.emit('weberror', {
      error: () => error,
      page: () => createPage(),
    } as never)

    await expect(monitor.assertNoIssues()).rejects.toThrow(/Unhandled browser issue detected/)
    expect(testInfo.attach).toHaveBeenCalledOnce()
    expect(attachments[0]?.name).toBe('browser-issues.txt')
    expect(attachments[0]?.body.toString()).toContain('render failed')
    expect(attachments[0]?.body.toString()).toContain('http://localhost:8787/path')
  })

  it('fails with request failure context', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_CONNECTION_RESET',
        method: 'POST',
        resourceType: 'fetch',
        url: 'http://localhost:8787/api/v1/posts',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).rejects.toThrow(/requestfailed/)
    const body = attachments[0]?.body.toString()
    expect(body).toContain('POST http://localhost:8787/api/v1/posts')
    expect(body).toContain('Resource: fetch')
    expect(body).toContain('Failure: net::ERR_CONNECTION_RESET')
  })

  it('ignores browser-cancelled request failures', async () => {
    const { testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_ABORTED',
        resourceType: 'fetch',
        url: 'http://localhost:8787/api/v1/my/notifications/unread',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).resolves.toBeUndefined()
    expect(testInfo.attach).not.toHaveBeenCalled()
  })

  it('ignores retryable localhost document connection failures', async () => {
    const { testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_CONNECTION_RESET',
        frameUrl: 'http://localhost:8787/',
        resourceType: 'document',
        url: 'http://localhost:8787/feed/news',
      }) as never,
    )
    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_CONNECTION_REFUSED',
        resourceType: 'document',
        url: 'http://127.0.0.1:8787/communities',
        frameThrows: true,
      }) as never,
    )
    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_CONNECTION_RESET',
        frameUrl: 'http://[::1]:8787/',
        resourceType: 'document',
        url: 'http://[::1]:8787/communities',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).resolves.toBeUndefined()
    expect(testInfo.attach).not.toHaveBeenCalled()
  })

  it('ignores local network-change request failures', async () => {
    const { testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_NETWORK_CHANGED',
        frameUrl: 'http://localhost:8787/topics',
        resourceType: 'fetch',
        url: 'http://localhost:8787/api/v1/bookmarks/topic/topic-id',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).resolves.toBeUndefined()
    expect(testInfo.attach).not.toHaveBeenCalled()
  })

  it('keeps malformed and non-retryable local document failures fatal', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_FAILED',
        frameUrl: 'http://localhost:8787/',
        resourceType: 'document',
        url: 'http://localhost:8787/feed/news',
      }) as never,
    )
    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_CONNECTION_RESET',
        frameUrl: 'http://localhost:8787/',
        resourceType: 'document',
        url: 'not a url',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).rejects.toThrow(/requestfailed/)
    const body = attachments[0]?.body.toString()
    expect(body).toContain('Failure: net::ERR_FAILED')
    expect(body).toContain('GET not a url')
  })

  it('keeps non-local document connection failures fatal', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_CONNECTION_RESET',
        frameUrl: 'https://example.com/',
        resourceType: 'document',
        url: 'https://example.com/feed/news',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).rejects.toThrow(/requestfailed/)
    expect(attachments[0]?.body.toString()).toContain('https://example.com/feed/news')
  })

  it('keeps non-local network-change request failures fatal', async () => {
    const { attachments, testInfo } = createTestInfo()
    const context = new MockBrowserContext()
    const monitor = new BrowserIssueMonitor(testInfo)
    monitor.monitorContext(context as unknown as BrowserContext)

    context.emit(
      'requestfailed',
      createRequest({
        failureText: 'net::ERR_NETWORK_CHANGED',
        frameUrl: 'https://example.com/topics',
        resourceType: 'fetch',
        url: 'https://example.com/api/v1/bookmarks/topic/topic-id',
      }) as never,
    )

    await expect(monitor.assertNoIssues()).rejects.toThrow(/requestfailed/)
    expect(attachments[0]?.body.toString()).toContain('https://example.com/api/v1/bookmarks')
  })
})
