'use client'

import * as Sentry from '@sentry/nextjs'
import {
  createMessagesCache,
  createTranslationsHook,
  createUnresolvedMessageReporter,
  seedFromBootstrap,
} from '@vouchington/localization/react'
import { createTranslator, type EnCatalog, type Translator } from '@ts-shared/ui-messages'
import {
  deserializeCatalog,
  type SerializableCatalog,
} from '@ts-shared/ui-messages/catalog-bootstrap'
import { DEFAULT_UI_LOCALE, normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { loadClientMessages } from './load-client-messages'
import { seedRouteMessages } from './route-messages-cache'
import { useUiLocale } from './ui-locale-context'

declare global {
  interface Window {
    __UI_MESSAGES__?: { locale: string; catalog: SerializableCatalog }
  }
}

const messagesCache = createMessagesCache<EnCatalog>(loadClientMessages)

export const { getMessagesPromise, invalidateMessages, mergeMessages, seedMessages } = messagesCache

export function seedFromWindowBootstrap(): void {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line no-underscore-dangle -- HTML bootstrap namespace for ui-messages.
  const bootstrap = window.__UI_MESSAGES__
  seedFromBootstrap(bootstrap, deserializeCatalog, seedMessages)
  if (bootstrap) {
    seedRouteMessages(
      bootstrap.locale,
      window.location.pathname,
      deserializeCatalog(bootstrap.catalog),
    )
  }
}

seedFromWindowBootstrap()

export const useTranslations = createTranslationsHook<EnCatalog, Translator>({
  cache: messagesCache,
  useLocale: useUiLocale,
  normalizeLocale: locale => normalizeUiLocale(locale) ?? undefined,
  defaultLocale: DEFAULT_UI_LOCALE,
  createTranslator: (locale, messages) =>
    createTranslator(locale, messages, {
      onUnresolved: createUnresolvedMessageReporter(locale, (error, context) => {
        Sentry.captureException(error, context)
      }),
    }),
})
