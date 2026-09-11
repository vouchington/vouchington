import { afterEach, describe, expect, it, vi } from 'vitest'
import { FF_COOKIE } from '../../../ts-shared/feature-flags/index.mts'
import { setFeatureFlags } from '../feature-flags.mts'

const mockRetryOnConnectionLost = vi.fn<(...args: Array<never>) => unknown>(
  (fn: () => Promise<unknown>) => fn(),
)
const mockAddCookies = vi.fn<() => unknown>()

function createMockPage() {
  return {
    goto: vi.fn<() => unknown>().mockResolvedValue(undefined),
    context: vi.fn<() => unknown>().mockReturnValue({ addCookies: mockAddCookies }),
    url: vi.fn<() => unknown>().mockReturnValue('https://example.test/plans'),
  }
}

describe('setFeatureFlags', () => {
  afterEach(() => {
    mockRetryOnConnectionLost.mockReset()
    mockAddCookies.mockReset()
  })

  it('sets an ff cookie scoped to the current browser context origin', async () => {
    const page = createMockPage()

    await setFeatureFlags(
      page as never,
      { memberships: true },
      {
        retryOnConnectionLost: mockRetryOnConnectionLost as never,
      },
    )

    expect(mockRetryOnConnectionLost).toHaveBeenCalledOnce()
    expect(page.goto).toHaveBeenCalledWith('/', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    expect(mockAddCookies).toHaveBeenCalledWith([
      {
        name: FF_COOKIE,
        sameSite: 'Lax',
        url: 'https://example.test',
        value: Buffer.from(JSON.stringify({ memberships: true }), 'utf8').toString('base64'),
      },
    ])
  })
})
