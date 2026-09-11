import { describe, expect, it, vi } from 'vitest'
import { storybookBundleHasStory } from '../storybook.mts'

function createPage(responseOrError: unknown) {
  return {
    request: {
      get: vi.fn<() => unknown>(() => {
        if (responseOrError instanceof Error) return Promise.reject(responseOrError)
        return Promise.resolve(responseOrError)
      }),
    },
  }
}

function createResponse(ok: boolean, body: unknown = {}) {
  return {
    ok: () => ok,
    json: vi.fn<() => unknown>(() => Promise.resolve(body)),
  }
}

describe('storybookBundleHasStory', () => {
  it('returns true when the Storybook index includes the requested story', async () => {
    const page = createPage(
      createResponse(true, {
        entries: {
          'design-system-shared-statuspage--rate-limited': {},
        },
      }),
    )

    await expect(
      storybookBundleHasStory(page as never, 'design-system-shared-statuspage--rate-limited'),
    ).resolves.toBe(true)
  })

  it('returns false when the Storybook index responds without the requested story', async () => {
    const page = createPage(
      createResponse(true, {
        entries: {
          'design-system-shared-statuspage--not-found': {},
        },
      }),
    )

    await expect(
      storybookBundleHasStory(page as never, 'design-system-shared-statuspage--rate-limited'),
    ).resolves.toBe(false)
  })

  it('returns false when the Storybook index is not available', async () => {
    const page = createPage(createResponse(false))

    await expect(
      storybookBundleHasStory(page as never, 'design-system-shared-statuspage--rate-limited'),
    ).resolves.toBe(false)
  })

  it('returns false when the Storybook index request times out', async () => {
    const page = createPage(new Error('apiRequestContext.get: Timeout 10000ms exceeded.'))

    await expect(
      storybookBundleHasStory(page as never, 'design-system-shared-statuspage--rate-limited'),
    ).resolves.toBe(false)
  })

  it('keeps malformed Storybook index responses as hard failures', async () => {
    const jsonError = new Error('invalid json')
    const page = createPage({
      ok: () => true,
      json: vi.fn<() => unknown>(() => Promise.reject(jsonError)),
    })

    await expect(
      storybookBundleHasStory(page as never, 'design-system-shared-statuspage--rate-limited'),
    ).rejects.toBe(jsonError)
  })

  it('uses a bounded request timeout for the stale-bundle probe', async () => {
    const page = createPage(createResponse(false))

    await storybookBundleHasStory(page as never, 'design-system-shared-statuspage--rate-limited')

    expect(page.request.get).toHaveBeenCalledWith('/storybook/index.json', { timeout: 5000 })
  })
})
