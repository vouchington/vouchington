import { describe, expect, it } from 'vitest'
import {
  assertResolvedImports,
  asResolveCheckBatch,
  isComputedImportExcluded,
  isLocalSpecifier,
  unresolvedImportFailures,
} from './unresolved-imports.mts'

const resolvedBatch = {
  allResolve: true,
  unresolvedFiles: [],
  results: [
    {
      file: 'web/lib/a.ts',
      allResolve: true,
      imports: [
        { specifier: 'next/dynamic', kind: 'static' as const, status: 'external' as const },
        { specifier: './recovery', kind: 'dynamic' as const, status: 'resolved' as const },
      ],
      unresolved: [],
    },
  ],
}

const unresolvedBatch = {
  allResolve: false,
  unresolvedFiles: ['web/lib/a.ts'],
  results: [
    {
      file: 'web/lib/a.ts',
      allResolve: false,
      imports: [
        { specifier: './missing', kind: 'dynamic' as const, status: 'unresolved' as const },
      ],
      unresolved: ['./missing'],
    },
  ],
}

describe('asResolveCheckBatch', () => {
  it('accepts a batch result and rejects malformed payloads', () => {
    expect(asResolveCheckBatch(resolvedBatch)).toBe(resolvedBatch)
    expect(asResolveCheckBatch(undefined)).toBeUndefined()
    expect(asResolveCheckBatch({ allResolve: true })).toBeUndefined()
  })
})

describe('isLocalSpecifier', () => {
  it('keeps relative, root, and Next aliases local', () => {
    expect(isLocalSpecifier('./missing')).toBe(true)
    expect(isLocalSpecifier('../missing')).toBe(true)
    expect(isLocalSpecifier('/abs')).toBe(true)
    expect(isLocalSpecifier('@/components/x')).toBe(true)
    expect(isLocalSpecifier('jose')).toBe(false)
    expect(isLocalSpecifier('@vouchington/utils/money')).toBe(false)
  })
})

describe('unresolvedImportFailures', () => {
  it('ignores resolved and external imports', () => {
    expect(unresolvedImportFailures(resolvedBatch)).toEqual([])
  })

  it('reports unresolved reachable local imports', () => {
    expect(unresolvedImportFailures(unresolvedBatch)).toEqual([
      'web/lib/a.ts: ./missing (unresolved)',
    ])
  })

  it('treats package specifiers as external even when resolveCheck labels them unresolved', () => {
    expect(
      unresolvedImportFailures({
        allResolve: false,
        unresolvedFiles: ['ts-shared/money/index.mts'],
        results: [
          {
            file: 'ts-shared/money/index.mts',
            allResolve: false,
            imports: [
              {
                specifier: '@vouchington/utils/money',
                kind: 'static',
                status: 'unresolved',
              },
            ],
            unresolved: ['@vouchington/utils/money'],
          },
        ],
      }),
    ).toEqual([])
  })

  it('skips a reviewed exclusion', () => {
    expect(
      unresolvedImportFailures(unresolvedBatch, [
        { file: 'web/lib/a.ts', specifier: './missing', reason: 'reviewed fixture' },
      ]),
    ).toEqual([])
  })

  it('fails closed when the resolveCheck report is missing', () => {
    expect(unresolvedImportFailures(undefined)).toEqual(['resolveCheck report missing'])
  })
})

describe('assertResolvedImports', () => {
  it('throws the unresolved list and stays quiet when every import is allowed', () => {
    expect(() => assertResolvedImports(resolvedBatch)).not.toThrow()
    expect(() => assertResolvedImports(unresolvedBatch)).toThrow(
      'Unresolved reachable imports:\nweb/lib/a.ts: ./missing (unresolved)',
    )
  })
})

describe('isComputedImportExcluded', () => {
  it('matches the computed specifier convention', () => {
    expect(
      isComputedImportExcluded('web/lib/a.ts', [
        { file: 'web/lib/a.ts', specifier: 'computed', reason: 'reviewed' },
      ]),
    ).toBe(true)
    expect(isComputedImportExcluded('web/lib/a.ts')).toBe(false)
  })
})
