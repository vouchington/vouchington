import type { Catalog, CatalogLeaf } from './index.mts'
import {
  isMessageDescriptor,
  type MessageDescriptor,
  type PluralForms,
} from './message-descriptors.mts'
import type { NativeConsumerManifestEntry } from './native-consumer-manifest.mts'
import { catalogTreeForLocale } from './load-catalog-json.mts'

export const NATIVE_RESOURCE_LOCALES = ['en', 'es', 'fr', 'pt'] as const
export type NativeResourceLocale = (typeof NATIVE_RESOURCE_LOCALES)[number]
export type NativeCatalogs = Readonly<Record<NativeResourceLocale, Catalog>>

export const DEFAULT_NATIVE_CATALOGS: NativeCatalogs = {
  en: catalogTreeForLocale('en', ['web', 'swift', 'dotnet']),
  es: catalogTreeForLocale('es', ['web', 'swift', 'dotnet']),
  fr: catalogTreeForLocale('fr', ['web', 'swift', 'dotnet']),
  pt: catalogTreeForLocale('pt', ['web', 'swift', 'dotnet']),
}

export function getNativeCatalogLeaf(catalog: Catalog, key: string): CatalogLeaf {
  let node: CatalogLeaf | Catalog = catalog
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null || isMessageDescriptor(node)) {
      throw new Error(`Native message key "${key}" does not resolve to a catalog leaf`)
    }
    const next: CatalogLeaf | Catalog | undefined = node[segment]
    if (next === undefined) throw new Error(`Unknown native message key "${key}"`)
    node = next
  }
  if (typeof node === 'string' || isMessageDescriptor(node)) return node
  throw new Error(`Native message key "${key}" resolves to a namespace, not a leaf`)
}

export function nativeLeafVariants(
  key: string,
  leaf: CatalogLeaf,
): Array<readonly [string, string]> {
  if (typeof leaf === 'string') return [[key, leaf]]
  if (leaf.kind === 'plural') {
    return [
      [`${key}.__plural.one`, requireNativeOneForm(key, leaf.forms)],
      [`${key}.__plural.other`, leaf.forms.other],
    ]
  }
  return Object.entries(leaf.cases)
    .toSorted(([left], [right]) => compareCodePoints(left, right))
    .flatMap(([selected, forms]) => [
      [`${key}.__select.${selected}.one`, requireNativeOneForm(key, forms)] as const,
      [`${key}.__select.${selected}.other`, forms.other] as const,
    ])
}

function requireNativeOneForm(key: string, forms: PluralForms): string {
  if (forms.one === undefined) {
    throw new Error(`Native message descriptor "${key}" must define a one form`)
  }
  return forms.one
}

export function validateNativeManifestCatalogs(
  manifest: readonly NativeConsumerManifestEntry[],
  catalogs: NativeCatalogs,
): void {
  const keys = manifest.map(entry => entry.key)
  if (new Set(keys).size !== keys.length)
    throw new Error('Native consumer manifest has duplicate keys')
  if (keys.join('\n') !== keys.toSorted(compareCodePoints).join('\n')) {
    throw new Error('Native consumer manifest keys must be sorted')
  }
  for (const entry of manifest) validateEntry(entry, catalogs)
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function validateEntry(entry: NativeConsumerManifestEntry, catalogs: NativeCatalogs): void {
  const canonical = getNativeCatalogLeaf(catalogs.en, entry.key)
  const canonicalVariants = nativeLeafVariants(entry.key, canonical)
  for (const locale of NATIVE_RESOURCE_LOCALES.slice(1)) {
    const localized = getNativeCatalogLeaf(catalogs[locale], entry.key)
    validateLeafKind(entry.key, locale, canonical, localized)
    const localizedVariants = nativeLeafVariants(entry.key, localized)
    canonicalVariants.forEach(([resourceKey, value], index) => {
      const localizedVariant = localizedVariants[index]!
      if (placeholders(value).join(',') !== placeholders(localizedVariant[1]).join(',')) {
        throw new Error(`Placeholder mismatch for "${resourceKey}" in ${locale}`)
      }
    })
  }
}

function validateLeafKind(
  key: string,
  locale: NativeResourceLocale,
  canonical: CatalogLeaf,
  localized: CatalogLeaf,
): void {
  if (typeof canonical !== typeof localized) {
    throw new Error(`Catalog leaf kind mismatch for "${key}" in ${locale}`)
  }
  if (
    isMessageDescriptor(canonical) &&
    isMessageDescriptor(localized) &&
    descriptorSignature(canonical) !== descriptorSignature(localized)
  ) {
    throw new Error(`Message descriptor mismatch for "${key}" in ${locale}`)
  }
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]!).toSorted()
}

function descriptorSignature(descriptor: MessageDescriptor): string {
  return JSON.stringify({
    kind: descriptor.kind,
    valueParameter: descriptor.valueParameter,
    selectParameter: descriptor.kind === 'select-plural' ? descriptor.selectParameter : null,
    numberParameters: (descriptor.numberParameters ?? []).toSorted(),
    cases: descriptor.kind === 'select-plural' ? Object.keys(descriptor.cases).toSorted() : [],
  })
}
