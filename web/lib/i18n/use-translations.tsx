'use client'

import { createMessagesCache, createTranslationsHook } from '@vouchington/localization/react'
import { seedFromBootstrap } from '@vouchington/localization'
import { createTranslator } from '@ts-shared/ui-messages'
import {
  deserializeCatalog,
  type SerializableCatalog,
} from '@ts-shared/ui-messages/catalog-bootstrap'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { loadClientMessages } from './load-client-messages'
import { createUnresolvedMessageReporter } from './report-unresolved-message'
import { seedRouteMessages } from './route-messages-cache'
import { useUiLocale } from './ui-locale-context'

declare global {
  interface Window {
    /** Set by an inline bootstrap `<script>` in `layout.tsx` (see
     * `serializeUiMessagesBootstrapScript`) before any client bundle code runs. */
    __UI_MESSAGES__?: { locale: string; catalog: SerializableCatalog }
  }
}

const messagesCache = createMessagesCache(loadClientMessages)

export const { invalidateMessages, mergeMessages } = messagesCache
const { seedMessages } = messagesCache

/**
 * Reads `window.__UI_MESSAGES__` (set by the inline bootstrap `<script>` `layout.tsx` renders —
 * see `serializeUiMessagesBootstrapScript`), restores the serializable catalog's compile-time
 * shape, and seeds the cache with the result.
 */
function seedFromWindowBootstrap(): void {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line no-underscore-dangle -- HTML bootstrap namespace for ui-messages, mirrors __VOUCHA_PUBLIC_CONFIG__.
  const bootstrap = window.__UI_MESSAGES__
  if (!bootstrap) return
  seedFromBootstrap(bootstrap, deserializeCatalog, (locale, catalog) => {
    seedMessages(locale, catalog)
    seedRouteMessages(locale, window.location.pathname, catalog)
  })
}

seedFromWindowBootstrap()

export const useTranslations = createTranslationsHook({
  cache: messagesCache,
  useLocale: useUiLocale,
  normalizeLocale: locale => normalizeUiLocale(locale) ?? undefined,
  defaultLocale: DEFAULT_UI_LOCALE,
  createTranslator: (locale, messages) =>
    createTranslator(locale, messages, { onUnresolved: createUnresolvedMessageReporter(locale) }),
})
