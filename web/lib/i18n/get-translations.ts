import { cache } from 'react'
import { createTranslator } from '@ts-shared/ui-messages'
import { getResolvedUiLocale } from './get-resolved-ui-locale'
import { loadServerMessages } from './load-server-messages'
import { createUnresolvedMessageReporter } from './report-unresolved-message'

/**
 * RSC/server helper: resolves the request's UI locale, loads its message catalog, and
 * returns a bound `t()` translator. Memoized per request via `React.cache` (mirrors
 * `getResolvedUiLocale`/`getCurrentUser`), so repeated calls across a render tree share one
 * resolution + catalog load.
 */
export const getTranslations = cache(async () => {
  const locale = await getResolvedUiLocale()
  const messages = process.env.VITEST
    ? await (await import('./load-json-messages')).loadJsonMessages(locale)
    : await loadServerMessages(locale)
  return createTranslator(locale, messages, {
    onUnresolved: createUnresolvedMessageReporter(locale),
  })
})
