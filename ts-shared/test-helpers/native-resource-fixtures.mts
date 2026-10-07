import type { CatalogLeaf } from '../ui-messages/index.mts'
import type { NativeCatalogs } from '../ui-messages/native-resource-catalog.mts'
import type { NativeConsumerManifestEntry } from '../ui-messages/native-consumer-manifest.mts'

type MutableFixtureCatalog = { [key: string]: CatalogLeaf | MutableFixtureCatalog }

export function nativeCatalogsFromEntries(
  entries: Readonly<Record<string, CatalogLeaf>>,
  localized: Readonly<Record<string, CatalogLeaf>> = entries,
): NativeCatalogs {
  function tree(values: Readonly<Record<string, CatalogLeaf>>): MutableFixtureCatalog {
    const root: MutableFixtureCatalog = {}
    for (const [key, value] of Object.entries(values)) {
      const segments = key.split('.')
      let parent = root
      for (const segment of segments.slice(0, -1)) {
        const child = parent[segment] ?? {}
        parent[segment] = child
        if (typeof child !== 'object' || 'kind' in child) throw new Error('Fixture path is a leaf')
        parent = child
      }
      parent[segments.at(-1)!] = value
    }
    return root
  }
  return { en: tree(entries), es: tree(localized), fr: tree(entries), pt: tree(entries) }
}

export const SIMPLE_NATIVE_INPUTS = {
  manifest: [{ key: 'common.save', consumers: ['swift', 'dotnet'] }],
  catalogs: nativeCatalogsFromEntries({ 'common.save': 'Save' }),
} as const satisfies { manifest: readonly NativeConsumerManifestEntry[]; catalogs: NativeCatalogs }

export const MODERATION_NATIVE_INPUTS = {
  manifest: [
    'native.moderation.summary.disposition.incomplete',
    'native.moderation.summary.disposition.none',
    'native.moderation.summary.disposition.pass',
    'native.moderation.summary.disposition.reject',
    'native.moderation.summary.disposition.review',
    'native.moderation.summary.evidence.flaggedCategories',
    'native.moderation.summary.evidence.signals',
    'native.moderation.summary.title',
  ].map(key => ({ key, consumers: ['swift', 'dotnet'] as const })),
  catalogs: nativeCatalogsFromEntries({
    'native.moderation.summary.disposition.incomplete': 'Incomplete',
    'native.moderation.summary.disposition.none': 'None',
    'native.moderation.summary.disposition.pass': 'Pass',
    'native.moderation.summary.disposition.reject': 'Reject',
    'native.moderation.summary.disposition.review': 'Review',
    'native.moderation.summary.evidence.flaggedCategories': {
      kind: 'plural',
      valueParameter: 'count',
      forms: { one: '{count} category', other: '{count} categories' },
    },
    'native.moderation.summary.evidence.signals': {
      kind: 'plural',
      valueParameter: 'count',
      forms: { one: '{count} signal', other: '{count} signals' },
    },
    'native.moderation.summary.title': 'Moderation',
  }),
}

export function catalogsWith(en: CatalogLeaf, es: CatalogLeaf = en): NativeCatalogs {
  return {
    en: { test: en },
    es: { test: es },
    fr: { test: en },
    pt: { test: en },
  }
}

export const PLURAL_NATIVE_CATALOGS = nativeCatalogsFromEntries({
  'settings.language.supportedCount': {
    kind: 'plural',
    valueParameter: 'count',
    forms: { one: '{count} language', other: '{count} languages' },
  },
  'shared.countLabel.format': {
    kind: 'select-plural',
    valueParameter: 'count',
    selectParameter: 'type',
    cases: { member: { one: '{count} membre', other: '{count} membres' } },
  },
  'shared.timeAgo.relativeDuration': {
    kind: 'select-plural',
    valueParameter: 'value',
    selectParameter: 'unit',
    cases: { day: { one: '{value} day ago', other: '{value} days ago' } },
  },
})

export const PLURAL_NATIVE_MANIFEST = [
  { key: 'settings.language.supportedCount', consumers: ['swift'] },
  { key: 'shared.countLabel.format', consumers: ['dotnet'] },
  { key: 'shared.timeAgo.relativeDuration', consumers: ['swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
