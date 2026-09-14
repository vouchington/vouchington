import { describe, expect, it } from 'vitest'
import { isMessageDescriptor } from './message-descriptors.mts'
import { enMessages, esMessages, frMessages, ptMessages } from './locale-catalogs.mts'

type LeafKind = 'string' | 'descriptor'

interface KeyEntry {
  path: string
  kind: LeafKind
}

function collectKeyEntries(catalog: Record<string, unknown>, prefix = ''): KeyEntry[] {
  const entries: KeyEntry[] = []
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      entries.push({ path, kind: 'string' })
    } else if (isMessageDescriptor(value)) {
      entries.push({ path, kind: 'descriptor' })
    } else if (value !== null && typeof value === 'object') {
      entries.push(...collectKeyEntries(value as Record<string, unknown>, path))
    } else {
      throw new Error(`Unexpected leaf type at "${path}": ${typeof value}`)
    }
  }
  return entries
}

const LOCALES = [
  { name: 'es', catalog: esMessages },
  { name: 'fr', catalog: frMessages },
  { name: 'pt', catalog: ptMessages },
] as const

describe('locale catalog parity', () => {
  const enEntries = collectKeyEntries(enMessages)
  const enKindByPath = new Map(enEntries.map(entry => [entry.path, entry.kind]))
  const enPaths = new Set(enKindByPath.keys())

  for (const { name, catalog } of LOCALES) {
    it(`${name} has exactly the same key paths as en (no missing, no extra)`, () => {
      const localePaths = new Set(collectKeyEntries(catalog).map(entry => entry.path))
      const missing = [...enPaths].filter(path => !localePaths.has(path)).sort()
      const extra = [...localePaths].filter(path => !enPaths.has(path)).sort()
      expect(missing).toEqual([])
      expect(extra).toEqual([])
    })

    it(`${name} leaf kinds (string vs descriptor) match en for every shared key`, () => {
      const mismatches = collectKeyEntries(catalog)
        .filter(entry => enKindByPath.has(entry.path))
        .filter(entry => enKindByPath.get(entry.path) !== entry.kind)
        .map(
          entry => `"${entry.path}" (en: ${enKindByPath.get(entry.path)}, ${name}: ${entry.kind})`,
        )
      expect(mismatches).toEqual([])
    })
  }
})

describe('catalog value regressions', () => {
  it('uses localized labels instead of raw URLs for the submitted dispute link', () => {
    expect(leaf(enMessages, 'extracted.disputes.disputeForm.myDisputes_5f61fead')).toBe(
      'My Disputes',
    )
    expect(leaf(esMessages, 'extracted.disputes.disputeForm.myDisputes_5f61fead')).toBe(
      'Mis disputas',
    )
    expect(leaf(frMessages, 'extracted.disputes.disputeForm.myDisputes_5f61fead')).toBe(
      'Mes litiges',
    )
    expect(leaf(ptMessages, 'extracted.disputes.disputeForm.myDisputes_5f61fead')).toBe(
      'Minhas Disputas',
    )
  })

  it('describes the support thread search fields supported by the API', () => {
    expect(
      leaf(
        enMessages,
        'extracted.support.adminSupportThreadFilters.searchBySubjectOrMessage_667f285e',
      ),
    ).toBe('Search by email or subject')
    expect(
      leaf(
        esMessages,
        'extracted.support.adminSupportThreadFilters.searchBySubjectOrMessage_667f285e',
      ),
    ).toBe('Buscar por correo o asunto')
    expect(
      leaf(
        frMessages,
        'extracted.support.adminSupportThreadFilters.searchBySubjectOrMessage_667f285e',
      ),
    ).toBe('Rechercher par e-mail ou objet')
    expect(
      leaf(
        ptMessages,
        'extracted.support.adminSupportThreadFilters.searchBySubjectOrMessage_667f285e',
      ),
    ).toBe('Pesquisar por e-mail ou assunto')
  })
})

function leaf(catalog: Record<string, unknown>, path: string): unknown {
  let node: unknown = catalog
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) throw new Error(`Missing ${path}`)
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}
