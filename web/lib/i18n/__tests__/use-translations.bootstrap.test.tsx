import { useEffect } from 'react'
import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getRouteMessagesPromise } from '@/lib/i18n/route-messages-cache'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { getWebLocalizationBatchClient } from '@/lib/api/client/localization'

/** The setup installs layout's serialized window bootstrap before the real module evaluates. */
function GreetingWithCount({ onHydrated }: { onHydrated: () => void }) {
  const t = useTranslations()
  useEffect(onHydrated, [onHydrated])
  return (
    <>
      <p data-testid='greeting'>{t('nav.home')}</p>
      <p data-testid='count'>{t('settings.language.supportedCount', { count: 2 })}</p>
    </>
  )
}

describe('translation bootstrap hydration', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (root) act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  it('hydrates the bootstrap catalog and plural descriptors without Suspense or a browser request', async () => {
    await expect(getRouteMessagesPromise('en', window.location.pathname)).resolves.toMatchObject({
      nav: { home: 'Home' },
    })
    container = document.createElement('div')
    container.innerHTML = '<p data-testid="greeting">Home</p><p data-testid="count">2 languages</p>'
    document.body.append(container)
    const onHydrated = vi.fn<() => void>()
    const onRecoverableError = vi.fn<(error: unknown) => void>()

    await act(async () => {
      root = hydrateRoot(
        container!,
        <UiLocaleProvider uiLocale='en'>
          <GreetingWithCount onHydrated={onHydrated} />
        </UiLocaleProvider>,
        { onRecoverableError },
      )
    })

    expect(onHydrated).toHaveBeenCalledOnce()
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="greeting"]')).toHaveTextContent('Home')
    expect(container.querySelector('[data-testid="count"]')).toHaveTextContent('2 languages')
    expect(getWebLocalizationBatchClient).not.toHaveBeenCalled()
  })

  it('loads translations through the browser API when no bootstrap was supplied', async () => {
    const bootstrap = Reflect.get(window, '__UI_MESSAGES__')
    Reflect.deleteProperty(window, '__UI_MESSAGES__')
    vi.resetModules()
    // Load a matching renderer after resetting the client singleton. The pure entry
    // avoids registering RTL lifecycle hooks inside this test; clean it explicitly.
    const testingLibrary = await vi.importActual<typeof import('@testing-library/react/pure')>(
      '@testing-library/react/pure',
    )
    const translations =
      await vi.importActual<typeof import('../use-translations')>('../use-translations')
    vi.mocked(getWebLocalizationBatchClient).mockResolvedValue({
      contract: 'v1',
      revision: 'fallback',
      ttlSeconds: 60,
      messages: { 'nav.home': 'Loaded from API' },
    })
    try {
      let rendered!: ReturnType<
        typeof testingLibrary.renderHook<ReturnType<typeof translations.useTranslations>, void>
      >
      await testingLibrary.act(async () => {
        rendered = testingLibrary.renderHook(() => translations.useTranslations())
      })
      expect(rendered.result.current('nav.home')).toBe('Loaded from API')
      expect(getWebLocalizationBatchClient).toHaveBeenCalledExactlyOnceWith('en', expect.any(Array))
    } finally {
      testingLibrary.cleanup()
      Reflect.set(window, '__UI_MESSAGES__', bootstrap)
    }
  })
})
