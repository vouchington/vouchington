import { describe, expect, it, vi } from 'vitest'
import type { BrowserContext, Route, TestInfo } from '@playwright/test'
import { playwrightTimeoutFixture } from '../../config/test-timeout.mts'
import { browserErrorsFixture } from '../test.mts'

type Listener = (...args: unknown[]) => void

class MockBrowserContext {
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
    return []
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
    timeout: 30_000,
    setTimeout: vi.fn<(timeout: number) => void>(),
  } as unknown as TestInfo
}

describe('browserErrorsFixture', () => {
  it('installs the product network rules and fails on unhandled browser errors', async () => {
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

    const routed = context.route.mock.calls.map(([pattern]) => String(pattern))
    expect(routed.some(pattern => pattern.includes('g\\.voucha\\.ai'))).toBe(true)
    expect(testInfo.attach).toHaveBeenCalledOnce()
  })

  it('rejects an effective test timeout above the product cap', async () => {
    const context = new MockBrowserContext()
    const testInfo = Object.assign(createTestInfo(), { timeout: 30_001 })

    await expect(
      browserErrorsFixture(
        { context: context as unknown as BrowserContext },
        () => Promise.resolve(),
        testInfo,
      ),
    ).rejects.toThrow(/Playwright effective test timeout/)
  })
})

describe('guarded browser monitor', () => {
  it('keeps browser monitoring active after the independent timeout guard', async () => {
    const context = new MockBrowserContext()
    const info = createTestInfo()
    await expect(
      playwrightTimeoutFixture(
        {},
        async () => {
          await browserErrorsFixture(
            { context: context as unknown as BrowserContext },
            async () => {
              context.emit('weberror', {
                error: () => new Error('guarded browser failure'),
                page: () => null,
              })
            },
            info,
          )
        },
        info,
      ),
    ).rejects.toThrow(/Unhandled browser issue detected/)
    expect(info.attach).toHaveBeenCalledOnce()
    expect(context.listeners.get('weberror')?.size).toBe(0)
  })
})
