import { getLocalizationDatabase } from '@services/localization/database'
import { createTranslator } from '@ts-shared/ui-messages'
import { catalogTreeFromLeaves } from '@ts-shared/ui-messages/catalog-tree'
import { catalogTreeForLocale } from '@ts-shared/ui-messages/load-catalog-json'
import { resolveLocalizationBatch } from '@vouchington/localization-compiler'
import type { NotificationTranslate } from './render-notification-types.mts'

const SELECTOR = 'notifications.kind.*'
const SUPPORTED = new Set(['en', 'es', 'fr', 'pt'])
const translators = new Map<string, NotificationTranslate>()

/** The catalog's source locale for a user's stored UI locale; unsupported locales read English. */
function catalogLocale(uiLocale: string | null | undefined): string {
  const language = (uiLocale ?? 'en').split('-')[0]!.toLowerCase()
  return SUPPORTED.has(language) ? language : 'en'
}

function buildTranslator(locale: string): NotificationTranslate {
  // Production ships only the compiled catalog; local runs and tests read the committed JSON.
  const catalog = process.env.LOCALIZATION_SQLITE_PATH
    ? catalogTreeFromLeaves(
        resolveLocalizationBatch(getLocalizationDatabase(), {
          consumer: 'web',
          locales: locale === 'en' ? ['en'] : [locale, 'en'],
          selectors: [SELECTOR],
        }).messages,
      )
    : catalogTreeForLocale(locale)
  const translate = createTranslator(locale, catalog, { onUnresolved: key => key })
  return (key, parameters) => translate(key as never, parameters)
}

/** A translator for `notifications.kind.*` copy in the user's UI locale, cached per locale. */
export function notificationTranslator(uiLocale: string | null | undefined): NotificationTranslate {
  const locale = catalogLocale(uiLocale)
  let translator = translators.get(locale)
  if (!translator) {
    translator = buildTranslator(locale)
    translators.set(locale, translator)
  }
  return translator
}
