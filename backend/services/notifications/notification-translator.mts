import { getLocalizationDatabase } from '@services/localization/database'
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
  const { messages } = resolveLocalizationBatch(getLocalizationDatabase(), {
    consumer: 'web',
    locales: locale === 'en' ? ['en'] : [locale, 'en'],
    selectors: [SELECTOR],
  })
  // Notification copy is plain `{name}` text, so no plural or descriptor runtime is needed.
  return (key, parameters) => {
    const leaf = messages[key]
    if (typeof leaf !== 'string') return key
    return leaf.replace(/\{(\w+)\}/g, (token, name: string) =>
      parameters && name in parameters ? String(parameters[name]) : token,
    )
  }
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
