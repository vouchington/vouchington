import { describe, expect, it } from 'vitest'
import {
  assertScannableWebAliases,
  closureIssuesForFile,
  computedDynamicImportHit,
  formatClosureScanFailure,
  isProductionWebSource,
  messageKeyCastHit,
  quotedAliasesFromText,
  unboundedTranslationKeyHit,
  uniqueClosureScanIssues,
} from './route-source-scan.mts'

describe('quotedAliasesFromText', () => {
  it('collects single-quoted, double-quoted, and backtick alias literals', () => {
    expect(
      quotedAliasesFromText(
        't(\'extracted.page.title\'); const a = "nav.home"; const b = `shared.label.format`',
      ),
    ).toEqual(new Set(['extracted.page.title', 'nav.home', 'shared.label.format']))
  })

  it('ignores unquoted alias-shaped tokens', () => {
    expect(quotedAliasesFromText('// extracted.page.title\nconst key = nav.home')).toEqual(
      new Set(),
    )
  })

  it('collects moderation staff-action labels so their routes deliver them', () => {
    expect(quotedAliasesFromText("const key = 'moderation.staffActions.queue_pause'")).toEqual(
      new Set(['moderation.staffActions.queue_pause']),
    )
  })

  it('recognizes the first segment of every supported web alias', () => {
    expect(() =>
      assertScannableWebAliases([
        'common.page.title',
        'extracted.page.title',
        'moderation.page.title',
        'nav.page.title',
        'settings.page.title',
        'shared.page.title',
      ]),
    ).not.toThrow()
  })

  it('rejects unsupported namespaces even alongside recognized aliases', () => {
    expect(() =>
      assertScannableWebAliases(['nav.home', 'zzz.one', 'future.one', 'zzz.two']),
    ).toThrow(new Error('Web catalog namespaces are not scanned: future, zzz'))
  })

  it('rejects a catalog with no web aliases', () => {
    expect(() => assertScannableWebAliases([])).toThrow(new Error('No web catalog aliases found'))
  })
})

describe('unboundedTranslationKeyHit', () => {
  it('detects template interpolation and concatenation in t()', () => {
    expect(unboundedTranslationKeyHit('return t(`extracted.foo.${id}`)')).toBe(true)
    expect(unboundedTranslationKeyHit("return t('extracted.foo.' + id)")).toBe(true)
    expect(unboundedTranslationKeyHit('return t(prefix + id)')).toBe(true)
  })

  it('allows a MessageKey identifier argument', () => {
    expect(unboundedTranslationKeyHit('return t(label)')).toBe(false)
    expect(unboundedTranslationKeyHit("return t('extracted.page.title')")).toBe(false)
  })
})

describe('computedDynamicImportHit', () => {
  it('detects template and identifier specifiers', () => {
    expect(computedDynamicImportHit('void import(`./${name}`)')).toBe(true)
    expect(computedDynamicImportHit('void import(moduleName)')).toBe(true)
  })

  it('allows literal specifiers including next/dynamic', () => {
    expect(computedDynamicImportHit("dynamic(() => import('./recovery'))")).toBe(false)
    expect(computedDynamicImportHit("void import('./missing')")).toBe(false)
    expect(
      computedDynamicImportHit(
        '// Absolute import (not sibling-relative) so Storybook can stub this\n',
      ),
    ).toBe(false)
  })
})

describe('production MessageKey casts', () => {
  it('flags production web source and skips tests and helpers', () => {
    expect(isProductionWebSource('web/lib/labels.ts')).toBe(true)
    expect(isProductionWebSource('web/lib/labels.test.ts')).toBe(false)
    expect(isProductionWebSource('web/lib/labels.stories.ts')).toBe(false)
    expect(isProductionWebSource('web/lib/__tests__/labels.ts')).toBe(false)
    expect(isProductionWebSource('web/test-helpers/labels.ts')).toBe(false)
    expect(messageKeyCastHit("const key = 'extracted.page.title' as MessageKey")).toBe(true)
    expect(messageKeyCastHit("const key = 'extracted.page.title' as\nMessageKey")).toBe(true)
    expect(messageKeyCastHit("const key = 'extracted.page.title' as Key")).toBe(false)
    expect(closureIssuesForFile('web/lib/labels.ts', 'export const k = x as MessageKey')).toEqual([
      { file: 'web/lib/labels.ts', reason: 'production MessageKey cast' },
    ])
    expect(
      closureIssuesForFile('web/lib/labels.test.ts', 'export const k = x as MessageKey'),
    ).toEqual([])
  })
})

describe('formatClosureScanFailure', () => {
  it('lists each file and reason', () => {
    expect(
      formatClosureScanFailure([
        { file: 'web/a.ts', reason: 'unbounded translation key' },
        { file: 'web/b.ts', reason: 'computed dynamic import' },
      ]),
    ).toBe(
      'Route i18n scan failed:\nweb/a.ts: unbounded translation key\nweb/b.ts: computed dynamic import',
    )
  })

  it('deduplicates the same file and reason', () => {
    const issue = { file: 'web/a.ts', reason: 'computed dynamic import' }
    expect(uniqueClosureScanIssues([issue, issue])).toEqual([issue])
  })
})
