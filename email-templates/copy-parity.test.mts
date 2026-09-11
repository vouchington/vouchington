import { SUPPORTED_UI_LOCALES } from '@ts-shared/languages/ui-locales'
import { describe, expect, it } from 'vitest'
import { emailCopyRegistry } from './copy-registry.mts'

type LeafKind = 'value' | 'function'

interface KeyEntry {
  path: string
  kind: LeafKind
}

/** Recursively walks a copy catalog, collecting dot-joined key paths and each leaf's kind. */
function collectKeyEntries(catalog: Record<string, unknown>, prefix = ''): KeyEntry[] {
  const entries: KeyEntry[] = []
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') {
      entries.push({ path, kind: 'function' })
    } else if (value !== null && typeof value === 'object') {
      entries.push(...collectKeyEntries(value as Record<string, unknown>, path))
    } else {
      entries.push({ path, kind: 'value' })
    }
  }
  return entries
}

const LOCALES = SUPPORTED_UI_LOCALES.filter(locale => locale !== 'en')

describe('email template copy parity', () => {
  for (const [templateName, copyByLocale] of Object.entries(emailCopyRegistry)) {
    const enCatalog = (copyByLocale as Record<string, Record<string, unknown>>).en
    const enEntries = collectKeyEntries(enCatalog)
    const enKindByPath = new Map(enEntries.map(entry => [entry.path, entry.kind]))
    const enPaths = new Set(enKindByPath.keys())

    for (const locale of LOCALES) {
      const localeCatalog = (copyByLocale as Record<string, Record<string, unknown>>)[locale]

      it(`template "${templateName}": ${locale} has exactly the same key paths as en (no missing, no extra)`, () => {
        expect(localeCatalog).toBeDefined()

        const localePaths = new Set(collectKeyEntries(localeCatalog).map(entry => entry.path))

        // Each entry below is a fully-qualified "template.locale.key.path" string so a
        // failure identifies the template, locale, and missing/mismatched key path at a glance.
        const missing = [...enPaths]
          .filter(path => !localePaths.has(path))
          .map(path => `${templateName}.${locale}.${path}`)
          .toSorted()
        const extra = [...localePaths]
          .filter(path => !enPaths.has(path))
          .map(path => `${templateName}.${locale}.${path}`)
          .toSorted()

        expect(missing).toEqual([])
        expect(extra).toEqual([])
      })

      it(`template "${templateName}": ${locale} leaf kinds (value vs function) match en for every shared key`, () => {
        const mismatches = collectKeyEntries(localeCatalog)
          .filter(entry => enKindByPath.has(entry.path))
          .filter(entry => enKindByPath.get(entry.path) !== entry.kind)
          .map(
            entry =>
              `${templateName}.${locale}.${entry.path} (en: ${enKindByPath.get(entry.path)}, ${locale}: ${entry.kind})`,
          )

        expect(mismatches).toEqual([])
      })
    }
  }
})
