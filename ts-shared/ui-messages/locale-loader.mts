import type { MessageCatalog } from '@vouchington/utils/message-catalog'
import { catalogTreeForLocale } from './load-catalog-json.mts'

/**
 * Resolves the message catalog for a given locale from the committed JSON shards.
 * Falls back to `en` for any unrecognized value.
 */
export async function loadMessages(locale: string): Promise<MessageCatalog> {
  switch (locale) {
    case 'en':
    case 'es':
    case 'fr':
    case 'pt':
      return catalogTreeForLocale(locale)
    default:
      return catalogTreeForLocale('en')
  }
}
