import { afterEach, describe, expect, it, vi } from 'vitest'
import { FF_COOKIE } from '../../../ts-shared/feature-flags/index.mts'
import { setFeatureFlags } from '../feature-flags.mts'

const mockAddCookies = vi.fn<() => unknown>()

function createMockPage() {
  return {
    goto: vi.fn<() => unknown>().mockResolvedValue(undefined),
    context: vi.fn<() => unknown>().mockReturnValue({ addCookies: mockAddCookies }),
  }
}

describe('setFeatureFlags', () => {
  afterEach(() => {
    mockAddCookies.mockReset()
  })

  it('sets an ff cookie scoped to the project origin without navigating', async () => {
    const page = createMockPage()

    await setFeatureFlags(
      page as never,
      { memberships: true },
      {
        cookieOrigin: () => 'https://example.test',
      },
    )

    expect(page.goto).not.toHaveBeenCalled()
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
