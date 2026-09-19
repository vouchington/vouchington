import { describe, expect, it } from 'vitest'
import {
  analyzeUnresolvedImports,
  initialClosureFiles,
  reportsById,
  uniqueClosureFiles,
} from './route-graph-analysis.mts'

describe('reportsById', () => {
  it('indexes reports by id', () => {
    const report = { id: '0', result: { files: [] } }
    expect(reportsById({ reports: [report] }).get('0')).toBe(report)
  })

  it('throws when a report id is missing', () => {
    expect(() => reportsById({ reports: [{ result: {} }] })).toThrow(
      'Missing route dependency report id',
    )
  })
})

describe('closure file union', () => {
  it('includes route seeds, dependency paths, and global files, then drops non-source paths', () => {
    const reports = new Map<string, unknown>([
      [
        '0',
        {
          type: 'dependencies',
          result: {
            files: [
              { path: 'web/lib/a.ts', depth: 1 },
              { path: 'web/lib/a.json', depth: 1 },
            ],
          },
        },
      ],
      [
        'global:0',
        {
          type: 'dependencies',
          result: { files: [{ path: 'web/components/extra.tsx', depth: 1 }] },
        },
      ],
    ])
    const initial = initialClosureFiles(
      [{ pattern: '/one', files: ['web/app/one/page.ts'] }],
      ['web/components/navbar.tsx'],
      reports,
    )
    expect(initial.get('/one')).toEqual(['web/app/one/page.ts', 'web/lib/a.ts', 'web/lib/a.json'])
    expect(initial.get('global:web/components/navbar.tsx')).toEqual([
      'web/components/navbar.tsx',
      'web/components/extra.tsx',
    ])
    expect(uniqueClosureFiles(initial)).toEqual([
      'web/app/one/page.ts',
      'web/lib/a.ts',
      'web/components/navbar.tsx',
      'web/components/extra.tsx',
    ])
  })

  it('skips resolveCheck when the closure has no source files', async () => {
    await expect(analyzeUnresolvedImports('/unused', [], {})).resolves.toBeUndefined()
  })
})
