import { cache } from 'react'
import { createTranslator, loadMessages } from '@ts-shared/ui-messages'
import { getResolvedUiLocale } from './get-resolved-ui-locale'

/**
 * RSC/server helper: resolves the request's UI locale, loads its message catalog, and
 * returns a bound `t()` translator. Memoized per request via `React.cache` (mirrors
 * `getResolvedUiLocale`/`getCurrentUser`), so repeated calls across a render tree share one
 * resolution + catalog load.
 */
export const getTranslations = cache(async () => {
  const locale = await getResolvedUiLocale()
  const messages = await loadMessages(locale)
  return createTranslator(locale, messages)
})
