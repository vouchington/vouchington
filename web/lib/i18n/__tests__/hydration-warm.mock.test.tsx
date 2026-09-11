import { Suspense, use } from 'react'
import { act, render } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMessagesPromise, seedMessages } from '@/lib/i18n/use-translations'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { createTranslator, type EnCatalog } from '@ts-shared/ui-messages'

// `loadMessages` is the genuinely-async, code-split dynamic import (see use-translations.tsx's
// doc comment). It's mocked here so the "unseeded" test controls exactly when it resolves,
// instead of racing against however fast a bundler-less test import happens to settle — the same
// trap that would make an eager-kickoff-only fix look fine in local dev and still blip in
// production, where the locale catalog is a real network-fetched chunk.
const deferredLoad = vi.hoisted(() => ({
  current: null as { promise: Promise<EnCatalog>; resolve: (value: EnCatalog) => void } | null,
}))

vi.mock(import('@ts-shared/ui-messages'), async () => {
  const actual =
    await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
  return {
    ...actual,
    loadMessages: vi.fn<VitestLooseMock>(() => {
      if (!deferredLoad.current) {
        throw new Error('test must arm deferredLoad.current before triggering a load')
      }
      return deferredLoad.current.promise
    }),
  }
})

function Greeting({ locale }: { locale: string }) {
  const messages = use(getMessagesPromise(locale))
  const t = createTranslator(locale, messages)
  return <p data-testid='greeting'>{t('nav.home')}</p>
}

/** Mirrors how a real page wraps a translated component: a Suspense boundary as a fallback of
 * last resort for whatever isn't warmed. Used only to show the *unseeded* suspend in isolation
 * (a plain client mount, not a hydration mismatch — see the module doc comment on
 * `AppNoBoundary` for why hydration specifically needs its own, throw-free test). */
function AppWithBoundary({ locale }: { locale: string }) {
  return (
    <UiLocaleProvider uiLocale={locale}>
      <Suspense fallback={<p data-testid='fallback'>…</p>}>
        <Greeting locale={locale} />
      </Suspense>
    </UiLocaleProvider>
  )
}

/**
 * The case team-lead explicitly asked to see: a client component with *no* ancestor Suspense
 * boundary at all. This is only safe to hydrate when the locale is seeded — an unseeded `use()`
 * here would suspend with nothing to catch it, which React treats as a fatal error, not a
 * graceful fallback. That's exactly the point: per-component Suspense boundaries are a workaround
 * for the unwarmed case, not a requirement once the active locale is seeded before hydration.
 */
function AppNoBoundary({ locale }: { locale: string }) {
  return (
    <UiLocaleProvider uiLocale={locale}>
      <Greeting locale={locale} />
    </UiLocaleProvider>
  )
}

describe('client-side catalog cache — hydration pop-in', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    if (root) act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    deferredLoad.current = null
  })

  it('without seeding, a fresh client render suspends and shows the Suspense fallback first', async () => {
    // Deliberately a plain client-side `render()`, not `hydrateRoot` — this isolates the
    // *suspend* behavior itself (the reason every codemod-touched component needed its own
    // Suspense boundary as a stopgap) from the separate, throw-prone mechanics of a real
    // client/server hydration mismatch. Only the final test below exercises `hydrateRoot`, and
    // only against a boundary-free tree that never mismatches (see its comment for why).
    let resolveDeferred!: (value: EnCatalog) => void
    const deferredPromise = new Promise<EnCatalog>(resolve => {
      resolveDeferred = resolve
    })
    deferredLoad.current = { promise: deferredPromise, resolve: resolveDeferred }

    const { loadMessages: realLoadMessages } =
      await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
    const realCatalog: EnCatalog = await realLoadMessages('en')

    const { container: renderedContainer } = render(
      <AppWithBoundary locale='hydration-warm-test-plain-render' />,
    )

    // The bug's root cause, isolated: on a fresh (unwarmed) locale, the very first render
    // suspends — there is no synchronous path to the resolved catalog yet.
    expect(renderedContainer.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(renderedContainer.textContent).not.toContain('Home')

    // Settle the deferred load so it doesn't leak a pending promise into the next test. Whether
    // `use()` picks the resolution up on the very next `act()` flush in this environment is a
    // separate, flaky-to-assert-on concern from the one this test exists to prove (the initial
    // suspend), so it's intentionally not asserted on here — the seeded-vs-unseeded contrast in
    // the next test is the actual before/after proof.
    await act(async () => {
      resolveDeferred(realCatalog)
      await deferredPromise
    })
  })

  it('fix: seeding the cache before render means the fallback never renders at all', async () => {
    const { loadMessages: realLoadMessages } =
      await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
    const realCatalog = await realLoadMessages('en')

    // The fix: whatever warmed the active locale's catalog (a value serialized into the initial
    // HTML, in the real design) seeds the client cache before the tree ever renders. Deliberately
    // a plain client-side `render()`, not `hydrateRoot`: hand-built fixture HTML has no way to
    // reproduce the DOM comment markers real SSR emits around a `<Suspense>` boundary, so hydrating
    // a Suspense-wrapped tree against hand-rolled markup always reads as a mismatch regardless of
    // seeding — an artifact of the fixture, not something this test needs to exercise. `render()`
    // isolates the actual claim: seeding is what decides whether the fallback ever commits, with
    // or without a real hydration pass in the picture. The no-ancestor-boundary test below is
    // where `hydrateRoot` is exercised instead, since a boundary-free tree has no markers to match.
    seedMessages('hydration-warm-test-seeded', realCatalog)

    const { container: renderedContainer } = render(
      <AppWithBoundary locale='hydration-warm-test-seeded' />,
    )

    // No suspend occurred: the fallback never commits, and the correct text is present
    // immediately in the same synchronous pass that started the render.
    expect(renderedContainer.querySelector('[data-testid="fallback"]')).toBeNull()
    expect(renderedContainer.querySelector('[data-testid="greeting"]')?.textContent).toBe('Home')
  })

  it('fix: a component with no ancestor Suspense boundary still hydrates correctly when seeded (hard-reload equivalent)', async () => {
    container = document.createElement('div')
    // Stand-in for real SSR output: no fallback markup ever existed server-side because the
    // server's own independent catalog load (see get-translations.ts) already had the resolved
    // text by render time.
    container.innerHTML = '<p data-testid="greeting">Home</p>'
    document.body.append(container)

    const { loadMessages: realLoadMessages } =
      await vi.importActual<typeof import('@ts-shared/ui-messages')>('@ts-shared/ui-messages')
    const realCatalog = await realLoadMessages('en')

    seedMessages('hydration-warm-test-seeded-no-boundary', realCatalog)

    let hydrationError: unknown
    act(() => {
      root = hydrateRoot(
        container!,
        <AppNoBoundary locale='hydration-warm-test-seeded-no-boundary' />,
        { onRecoverableError: error => (hydrationError = error) },
      )
    })

    // The core claim of the "Suspense at scale" fix: this component has zero Suspense ancestors
    // (see `AppNoBoundary`), yet hydration completes cleanly with no recoverable error and the
    // correct text present immediately — because `use()` resolved synchronously off the seeded
    // cache instead of ever suspending. No per-component Suspense boundary was needed.
    expect(hydrationError).toBeUndefined()
    expect(container.querySelector('[data-testid="greeting"]')?.textContent).toBe('Home')
  })
})
