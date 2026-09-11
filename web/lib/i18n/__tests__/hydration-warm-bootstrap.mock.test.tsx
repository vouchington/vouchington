import { use } from 'react'
import { act } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeCatalog } from '@ts-shared/ui-messages/catalog-bootstrap'
import { getMessagesPromise, seedFromWindowBootstrap } from '@/lib/i18n/use-translations'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { createTranslator, type EnCatalog } from '@ts-shared/ui-messages'

const UI_MESSAGES_KEY: keyof Window = '__UI_MESSAGES__'

// If `seedFromWindowBootstrap` failed to seed the cache, `getMessagesPromise` would fall back to
// `loadMessages`. Rejecting it here turns that failure into a loud, synchronous test error instead
// of a race that happens to resolve before any assertion runs — the same trap a "looks fine
// locally" fix could hide, since a real network-fetched locale chunk is never this fast.
vi.mock(import('@ts-shared/ui-messages'), async () => {
  const actual =
    await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
  return {
    ...actual,
    loadMessages: vi.fn<VitestLooseMock>(() => {
      throw new Error(
        'loadMessages must not be called: the bootstrap-seeded locale should hit the synchronous cache path',
      )
    }),
  }
})

/** No ancestor Suspense boundary anywhere in this tree — the exact case team-lead asked to see
 * proven end to end through the real production seam (`window.__UI_MESSAGES__` →
 * `seedFromWindowBootstrap` → serialized catalog → seeded cache), not just the underlying
 * `seedMessages` primitive already covered by `hydration-warm.mock.test.tsx`. Renders both a
 * plain string leaf and a plural descriptor, so a partial seed would fail this
 * test on the `count` assertion even if the `greeting` assertion happened to pass. */
function GreetingWithCount({ locale }: { locale: string }) {
  const messages = use(getMessagesPromise(locale))
  const t = createTranslator(locale, messages)
  return (
    <>
      <p data-testid='greeting'>{t('nav.home')}</p>
      <p data-testid='count'>{t('settings.language.supportedCount', { count: 2 })}</p>
    </>
  )
}

describe('seedFromWindowBootstrap — production hydration-warming path', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (root) act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    Reflect.deleteProperty(window, UI_MESSAGES_KEY)
  })

  it('seeds the cache from window.__UI_MESSAGES__ and hydrates plural descriptors without Suspense', async () => {
    // Must be a real BCP-47 tag (not an arbitrary test label like the other hydration-warm
    // tests use) because, unlike those, this test actually exercises the function leaf, which
    // calls Intl.PluralRules(locale) internally — an invalid tag throws there, not in this test.
    const locale = 'en'
    const { loadMessages: realLoadMessages } =
      await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
    const realCatalog: EnCatalog = await realLoadMessages('en')

    // Mirrors exactly what layout.tsx ships: only the string leaves, deep-cloned so this test
    // exercises a value detached from the in-memory object serializeCatalog returned, not that
    // object's own reference. (The literal JSON-text round trip through the inline <script> tag —
    // e.g. Unicode/HTML-terminator escaping — is covered separately by
    // ts-shared/ui-messages/catalog-bootstrap.test.mts and web/lib/utils/__tests__/ui-messages-bootstrap.test.ts.)
    const catalog = serializeCatalog(realCatalog)
    const cloned = structuredClone(catalog)
    Reflect.set(window, UI_MESSAGES_KEY, { locale, catalog: cloned })

    // The production trigger is a bare module-scope call at import time (too early for this test
    // to have set the global above); it's exported specifically so a test can re-invoke it with
    // controlled timing. See its doc comment in use-translations.tsx.
    seedFromWindowBootstrap()

    container = document.createElement('div')
    // Stand-in for real SSR output: the server's own independent catalog load (get-translations.ts)
    // already rendered the fully-resolved text, so there is no fallback markup to reconcile against.
    container.innerHTML = '<p data-testid="greeting">Home</p><p data-testid="count">2 languages</p>'
    document.body.append(container)

    let hydrationError: unknown
    act(() => {
      root = hydrateRoot(
        container!,
        <UiLocaleProvider uiLocale={locale}>
          <GreetingWithCount locale={locale} />
        </UiLocaleProvider>,
        { onRecoverableError: error => (hydrationError = error) },
      )
    })

    // The core claim: zero Suspense ancestors, yet hydration completes cleanly with no
    // recoverable error and the correct text present immediately, because `use()` resolved
    // synchronously off the bootstrap-seeded cache instead of ever suspending.
    expect(hydrationError).toBeUndefined()
    expect(container.querySelector('[data-testid="greeting"]')?.textContent).toBe('Home')
    // Proves the plural descriptor crossed the wire with the rest of the complete catalog.
    expect(container.querySelector('[data-testid="count"]')?.textContent).toBe('2 languages')
  })
})
