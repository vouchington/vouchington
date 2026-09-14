import { formatNumber } from '@ts-shared/utils/format'
import {
  createMessageTranslator,
  type MessageCatalog,
  type MessageKey as CatalogMessageKey,
  type MessageTranslator,
} from '@vouchington/utils/message-catalog'
import { lookupCatalogLeaf } from './catalog-tree.mts'
import type { MessageDescriptor } from './message-descriptors.mts'

/** A plain interpolatable string or serializable plural/select-plural descriptor. */
export type CatalogLeaf = string | MessageDescriptor

/** A nested object catalog: every value is a leaf or another nested `Catalog`. */
export type Catalog = MessageCatalog

/** The `en` catalog's exact shape — every other locale catalog must `satisfies` this. */
export type EnCatalog = MessageCatalog

/** Every valid dot-joined key path in the `en` catalog — the `t()` key parameter type. */
export type MessageKey = CatalogMessageKey<EnCatalog>

/**
 * Builds a `t()` function bound to a locale + its resolved catalog. Resolves the dot-path
 * through the nested catalog; evaluates serializable plural descriptors and interpolates
 * `{param}` placeholders in string leaves. Default is throw-loud on an unresolvable path.
 * `MessageKey` still proves the key exists in the committed catalog; live web catalogs are
 * selected subsets, so callers may pass `onUnresolved` to degrade a miss instead of throwing.
 */
export type Translator = MessageTranslator<EnCatalog>

export type CreateTranslatorOptions = {
  readonly onUnresolved?: (key: MessageKey) => string
}

export function createTranslator(
  locale: string,
  catalog: EnCatalog,
  options: CreateTranslatorOptions = {},
): Translator {
  const translate = createMessageTranslator(locale, catalog, { formatNumber })
  const onUnresolved = options.onUnresolved
  if (onUnresolved === undefined) return translate
  return (key, parameters) => {
    if (lookupCatalogLeaf(catalog, key) === undefined) return onUnresolved(key)
    return translate(key, parameters)
  }
}
