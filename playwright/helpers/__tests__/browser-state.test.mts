import { describe, expect, it, vi } from 'vitest'

function createMockPage() {
  const context = {
    clearCookies: vi.fn<() => unknown>().mockResolvedValue(undefined),
  }

  return {
    addInitScript: vi.fn<(script: unknown, arg: unknown) => unknown>().mockResolvedValue(undefined),
    context: vi.fn<() => unknown>().mockReturnValue(context),
    evaluate: vi.fn<(script: unknown, arg: unknown) => unknown>().mockResolvedValue(undefined),
    testContext: context,
  }
}

describe('browser-state helpers', () => {
  it('dedupes localStorage keys for pre-navigation cleanup', async () => {
    const { removeLocalStorageKeysBeforeNavigation } = await import('../browser-state.mts')
    const page = createMockPage()

    await removeLocalStorageKeysBeforeNavigation(page as never, ['feed-style', 'feed-style'])

    expect(page.addInitScript).toHaveBeenCalledTimes(1)
    expect(page.addInitScript.mock.calls[0][1]).toEqual(['feed-style'])
  })

  it('can clear keys on an already-loaded origin', async () => {
    const { removeLocalStorageKeys } = await import('../browser-state.mts')
    const page = createMockPage()

    await removeLocalStorageKeys(page as never, ['theme'])

    expect(page.evaluate).toHaveBeenCalledTimes(1)
    expect(page.evaluate.mock.calls[0][1]).toEqual(['theme'])
  })

  it('clears cookies without clearing localStorage wholesale', async () => {
    const { resetAnonymousBrowserStateBeforeNavigation } = await import('../browser-state.mts')
    const page = createMockPage()

    await resetAnonymousBrowserStateBeforeNavigation(page as never, ['list-style'])

    expect(page.context).toHaveBeenCalledTimes(1)
    expect(page.testContext.clearCookies).toHaveBeenCalledTimes(1)
    expect(page.addInitScript.mock.calls[0][1]).toEqual(['list-style'])
    expect(page.evaluate).not.toHaveBeenCalled()
  })
})
