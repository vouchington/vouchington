import type {
  CatalogMessage,
  LocalizationCatalog,
  LocalizationConsumer,
  TranslationValue,
} from '@vouchington/localization'
import type { MessageCatalog } from '@vouchington/utils/message-catalog'
import { catalogTreeFromMessages } from './catalog-tree.mts'
import aliases from '../../localization/catalog/aliases.json' with { type: 'json' }
import copies from '../../localization/catalog/copies.json' with { type: 'json' }
import enUs from '../../localization/catalog/translations/en-US.json' with { type: 'json' }
import es from '../../localization/catalog/translations/es.json' with { type: 'json' }
import fr from '../../localization/catalog/translations/fr.json' with { type: 'json' }
import pt from '../../localization/catalog/translations/pt.json' with { type: 'json' }

let cachedMessages: CatalogMessage[] | undefined

type CatalogTables = Pick<LocalizationCatalog, 'aliases' | 'copies' | 'translations'>

const CATALOG = {
  aliases: aliases as CatalogTables['aliases'],
  copies: copies as CatalogTables['copies'],
  translations: {
    'en-US': enUs,
    es,
    fr,
    pt,
  } as CatalogTables['translations'],
}

export function catalogMessagesFromTables(catalog: CatalogTables): CatalogMessage[] {
  const copies = new Map(catalog.copies.map(copy => [copy.id, copy]))
  const translations = new Map<string, Record<string, TranslationValue>>()
  for (const [locale, rows] of Object.entries(catalog.translations)) {
    for (const row of rows) {
      const values = translations.get(row.id) ?? {}
      values[locale] = row.value
      translations.set(row.id, values)
    }
  }
  const aliases = new Map<string, { consumers: LocalizationConsumer[]; copyId: string }>()
  for (const alias of catalog.aliases) {
    const existing = aliases.get(alias.alias)
    if (existing === undefined) {
      aliases.set(alias.alias, { consumers: [alias.consumer], copyId: alias.copyId })
      continue
    }
    if (existing.copyId !== alias.copyId) {
      throw new TypeError(`Alias "${alias.alias}" maps to more than one copy`)
    }
    existing.consumers.push(alias.consumer)
  }
  return [...aliases]
    .toSorted(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([id, alias]) => {
      const copy = copies.get(alias.copyId)
      if (copy === undefined) throw new TypeError(`Alias "${id}" references missing copy`)
      const values = translations.get(copy.id)
      if (values === undefined) throw new TypeError(`Copy "${copy.id}" has no translations`)
      return { id, consumers: alias.consumers, descriptor: copy.descriptor, translations: values }
    })
}

export function loadCatalogMessages(): CatalogMessage[] {
  cachedMessages ??= catalogMessagesFromTables(CATALOG)
  return cachedMessages
}

export function catalogTreeForLocale(
  locale: string,
  consumers: readonly LocalizationConsumer[] = ['web'],
): MessageCatalog {
  return catalogTreeFromMessages(loadCatalogMessages(), locale, consumers)
}
