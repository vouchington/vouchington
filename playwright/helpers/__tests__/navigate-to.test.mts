import { afterEach, describe, expect, it, vi } from 'vitest'
import { navigateTo } from '../navigate-to.mts'

const mockInstallTurnstileStub = vi.fn<() => unknown>()
const mockRetryOnConnectionLost = vi.fn<(...args: Array<never>) => unknown>(
  (fn: () => Promise<unknown>) => fn(),
)

function createMockPage() {
  return {
    goto: vi.fn<() => unknown>().mockResolvedValue(undefined),
    waitForLoadState: vi.fn<() => unknown>().mockResolvedValue(undefined),
    evaluate: vi.fn<() => unknown>().mockResolvedValue(undefined),
  }
}

describe('navigateTo', () => {
  afterEach(() => {
    mockInstallTurnstileStub.mockReset()
    mockRetryOnConnectionLost.mockReset()
  })

  it('installs turnstile stub and waits for network idle', async () => {
    const page = createMockPage()

    await navigateTo(
      page as never,
      '/foo',
      {},
      {
        installTurnstileStub: mockInstallTurnstileStub as never,
        retryOnConnectionLost: mockRetryOnConnectionLost as never,
      },
    )

    expect(mockInstallTurnstileStub).toHaveBeenCalledWith(page)
    expect(mockRetryOnConnectionLost).toHaveBeenCalledOnce()
    expect(page.goto).toHaveBeenCalledWith('/foo', { waitUntil: 'domcontentloaded' })
    expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle')
    expect(page.evaluate).toHaveBeenCalledOnce()
  })
})
