import { describe, expect, it } from 'vitest'
import { residualProductCopy } from './email-copy-registry-policy.mts'

describe('residual product copy registries', () => {
  it('allows catalog-backed product copy', () => {
    expect(
      residualProductCopy([
        { path: 'catalog-copy.mts', text: "locale === 'en'" },
        { path: 'nested/catalog.tsx', text: 'const copy = emailCopy(locale)\n' },
        { path: 'copy.test.mts', text: 'const copyByLocale = {}' },
        { path: 'notes.md', text: 'ByLocale' },
      ]),
    ).toEqual([])
  })

  it('finds locale registries nested below the template root', () => {
    expect(
      residualProductCopy([
        { path: 'nested/catalog.tsx', text: 'const copy = emailCopy(locale)\n' },
        { path: 'nested/residual.tsx', text: 'const nestedCopyByLocale = { en: "Hello" }\n' },
      ]),
    ).toEqual(['nested/residual.tsx'])
  })

  it('rejects inline locale branches outside the catalog reader', () => {
    expect(
      residualProductCopy([{ path: 'inline.mts', text: "locale === 'fr' ? 'Bonjour' : 'Hello'" }]),
    ).toEqual(['inline.mts'])
  })
})
