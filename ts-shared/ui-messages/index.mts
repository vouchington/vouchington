import type enMessages from './messages/en.ts'
import { formatNumber } from '@ts-shared/utils/format'
import {
  createMessageTranslator,
  type MessageCatalog,
  type MessageKey as CatalogMessageKey,
  type MessageTranslator,
} from '@vouchington/utils/message-catalog'
import type { MessageDescriptor } from './message-descriptors.mts'

/** A plain interpolatable string or serializable plural/select-plural descriptor. */
export type CatalogLeaf = string | MessageDescriptor

/** A nested object catalog: every value is a leaf or another nested `Catalog`. */
export type Catalog = MessageCatalog

/** The `en` catalog's exact shape — every other locale catalog must `satisfies` this. */
export type EnCatalog = typeof enMessages

/** Every valid dot-joined key path in the `en` catalog — the `t()` key parameter type. */
export type MessageKey = CatalogMessageKey<EnCatalog>

/**
 * Builds a `t()` function bound to a locale + its resolved catalog. Resolves the dot-path
 * through the nested catalog; evaluates serializable plural descriptors and interpolates
 * `{param}` placeholders in string leaves. Throws on an unresolvable path — `MessageKey`
 * prevents this at compile time, so a runtime miss means a real bug, not something to
 * silently degrade.
 */
export type Translator = MessageTranslator<EnCatalog>

export function createTranslator(locale: string, catalog: EnCatalog): Translator {
  return createMessageTranslator(locale, catalog, { formatNumber })
}

export { loadMessages } from './locale-loader.mts'
