'use client'

import { use, useMemo } from 'react'
import { createTranslator, loadMessages, type EnCatalog } from '@ts-shared/ui-messages'
import {
  deserializeCatalog,
  type SerializableCatalog,
} from '@ts-shared/ui-messages/catalog-bootstrap'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { useUiLocale } from './ui-locale-context'

declare global {
  interface Window {
    /** Set by an inline bootstrap `<script>` in `layout.tsx` (see
     * `serializeUiMessagesBootstrapScript`) before any client bundle code runs. */
    __UI_MESSAGES__?: { locale: string; catalog: SerializableCatalog }
  }
}

// Module-scoped so every `useTranslations()` call site across the app shares one in-flight/
// resolved catalog load per locale, instead of each component re-fetching its own copy.
//
// Also the seam a hydration-warming mechanism hooks into: `loadMessages(locale)` is a genuinely
// async dynamic import (deliberately code-split per locale), so on a fresh page load the first
// `use()` call always suspends here — even though SSR, running its own independent catalog load
// (see `get-translations.ts`), already rendered fully-resolved text. React's hydration then
// discards that correct markup and shows the nearest Suspense fallback until this promise
// resolves — a visible pop-in with no per-component fix (wrapping every codemod-touched
// component in its own `<Suspense>` only decides what flashes, not whether it flashes).
// `seedMessages` closes that window: seeding this cache with an already-resolved value before
// the first render (e.g. from a value serialized into the initial HTML) makes the first `use()`
// call return synchronously, so hydration never suspends at all. See
// `__tests__/hydration-warm.test.tsx` for a reproduction of the bug and proof of this fix.
const messagesCache = new Map<string, Promise<EnCatalog>>()

type FulfilledThenable<T> = Promise<T> & { status: 'fulfilled'; value: T }

/**
 * Wraps an already-known value as a thenable `use()` can read synchronously on its very *first*
 * call. A bare `Promise.resolve(value)` does not achieve this: `use()` still has to attach its
 * own `.then()` handler to an unfamiliar promise and wait a microtask before it can trust its
 * fulfillment, even though the value was already known — so the first render still suspends
 * (proven by `__tests__/hydration-warm.test.tsx`, which failed against a `Promise.resolve()`
 * seed before this tagging was added). Pre-tagging `status`/`value` mirrors what `use()` itself
 * writes onto a thenable after resolving it once, so a first-ever call skips straight to the
 * synchronous fast path instead of suspending and retrying on the next microtask.
 */
function createFulfilledThenable<T>(value: T): FulfilledThenable<T> {
  const thenable = Promise.resolve(value) as FulfilledThenable<T>
  thenable.status = 'fulfilled'
  thenable.value = value
  return thenable
}

/**
 * Pre-populates the client-side catalog cache with an already-resolved value, so the first
 * `use()` call for `locale` returns synchronously instead of suspending. Must be called before
 * any `useTranslations()` consumer for `locale` renders. A no-op if `locale` is already cached
 * (first caller wins — never clobbers an in-flight or already-resolved load).
 */
export function seedMessages(locale: string, messages: EnCatalog): void {
  if (messagesCache.has(locale)) return
  messagesCache.set(locale, createFulfilledThenable(messages))
}

export function getMessagesPromise(locale: string): Promise<EnCatalog> {
  let promise = messagesCache.get(locale)
  if (!promise) {
    promise = loadMessages(locale)
    messagesCache.set(locale, promise)
  }
  return promise
}

/**
 * Reads `window.__UI_MESSAGES__` (set by the inline bootstrap `<script>` `layout.tsx` renders —
 * see `serializeUiMessagesBootstrapScript`), restores the serializable catalog's compile-time
 * shape, and seeds the cache with the result.
 *
 * Exported (rather than only run as a bare module-scope side effect) so tests can control exactly
 * when it runs relative to setting `window.__UI_MESSAGES__` — ESM module evaluation happens once,
 * at import time, which is too early for a test to have set the global first. In production this
 * distinction doesn't matter: this module is invoked once, at the bottom of this file, the moment
 * any component's `import { useTranslations } ...` first evaluates this module — which is always
 * before that (or any other) component in the same bundle renders.
 */
export function seedFromWindowBootstrap(): void {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line no-underscore-dangle -- HTML bootstrap namespace for ui-messages, mirrors __VOUCHA_PUBLIC_CONFIG__.
  const bootstrap = window.__UI_MESSAGES__
  if (!bootstrap) return
  seedMessages(bootstrap.locale, deserializeCatalog(bootstrap.catalog))
}

seedFromWindowBootstrap()

/**
 * Client hook counterpart to `getTranslations()`. Reads the active locale from
 * `UiLocaleProvider` and suspends (via `use()`) on that locale's message catalog load. The
 * catalog is loaded independently here so locale chunks remain code-split when there is no
 * server bootstrap. `seedFromWindowBootstrap` (above) is what actually closes
 * the hydration-pop-in window in production; `seedMessages` remains exported directly for tests
 * and for any caller that already has a resolved catalog in hand.
 */
export function useTranslations() {
  // `useUiLocale()` is typed as a bare `string`: in production it is always one of
  // `SUPPORTED_UI_LOCALES` (fed by `getResolvedUiLocale()`), but the same context is also used by
  // tests to inject arbitrary Intl formatting locales (e.g. `de-DE`) unrelated to the message
  // catalog, which only ships `en`/`es`/`fr`/`pt`. Normalize defensively so an unsupported tag
  // falls back to the default catalog instead of failing to load.
  const locale = normalizeUiLocale(useUiLocale()) ?? DEFAULT_UI_LOCALE
  const messages = use(getMessagesPromise(locale))
  return useMemo(() => createTranslator(locale, messages), [locale, messages])
}
