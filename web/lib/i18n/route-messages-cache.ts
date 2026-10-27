import type { EnCatalog } from '@ts-shared/ui-messages'
import { createMessagesCache } from '@vouchington/localization/react'
import { loadClientMessages } from './load-client-messages'

/** The route selector batch is cached independently for each locale and pathname. */
export function createRouteMessagesCache(
  loadMessages: (locale: string, pathname: string) => Promise<EnCatalog>,
) {
  const cache = createMessagesCache((key: string) => {
    const separator = key.indexOf('\u0000')
    return loadMessages(key.slice(0, separator), key.slice(separator + 1))
  })
  const key = (locale: string, pathname: string) => `${locale}\u0000${pathname}`
  return {
    getMessagesPromise: (locale: string, pathname: string) =>
      cache.getMessagesPromise(key(locale, pathname)),
    invalidateMessages: (locale: string, pathname: string) =>
      cache.invalidateMessages(key(locale, pathname)),
    seedMessages: (locale: string, pathname: string, messages: EnCatalog) =>
      cache.seedMessages(key(locale, pathname), messages),
  }
}

const routeMessagesCache = createRouteMessagesCache(loadClientMessages)
export const {
  getMessagesPromise: getRouteMessagesPromise,
  invalidateMessages: invalidateRouteMessages,
  seedMessages: seedRouteMessages,
} = routeMessagesCache
