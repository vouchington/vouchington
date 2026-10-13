import type { ResolveCheckImport, TsConfigDiagnostic } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

import { classifierGoldenImportErrors } from './check-classifier-golden-imports.mts'

type Fixture = {
  closure?: string[]
  diagnostics?: TsConfigDiagnostic[]
  imports?: Record<string, ResolveCheckImport[]>
  sources?: Record<string, string>
  requiredFiles?: string[]
}

function edge(
  specifier: string,
  status: ResolveCheckImport['status'],
  resolved?: string,
  kind: ResolveCheckImport['kind'] = 'static',
): ResolveCheckImport {
  return { specifier, kind, status, computed: false, ...(resolved ? { resolved } : {}) }
}

function audit({
  closure = ['lib.mts'],
  diagnostics = [],
  imports = { 'entry.mts': [edge('./lib.mjs', 'resolved', 'lib.mts')] },
  sources = {},
  requiredFiles = [],
}: Fixture = {}) {
  const scanned: string[][] = []
  const errors = classifierGoldenImportErrors({
    entrypoints: ['entry.mts'],
    requiredFiles,
    readClosure: () => Promise.resolve({ files: closure, diagnostics }),
    readImports: files => {
      scanned.push(files)
      return Promise.resolve({
        allResolve: true,
        unresolvedFiles: [],
        results: files.map(file => ({
          file,
          allResolve: true,
          imports: imports[file] ?? [],
          unresolved: [],
        })),
      })
    },
    readSource: file => sources[file] ?? '',
  })
  return { errors, scanned }
}

describe('classifier golden import audit', () => {
  it('accepts a closed graph and scans the entrypoints with their dependencies', async () => {
    const { errors, scanned } = audit({ requiredFiles: ['lib.mts'] })
    await expect(errors).resolves.toEqual([])
    expect(scanned).toEqual([['entry.mts', 'lib.mts']])
  })

  it.each([
    'INSERT INTO classifiers (id) VALUES ($1)',
    'update classifier_candidate_thresholds set value = 1',
    'DELETE FROM classifier_prompt_versions',
  ])('reports a configuration write in any scanned file: %s', async statement => {
    const { errors } = audit({ sources: { 'entry.mts': `sql\`${statement}\`` } })
    await expect(errors).resolves.toEqual(['entry.mts writes classifier configuration'])
  })

  it.each([
    edge('./missing.mjs', 'unresolved'),
    edge('./dynamic-missing.mjs', 'unresolved', undefined, 'dynamic'),
    edge('@agents/missing', 'external'),
    edge('@services/missing', 'external', undefined, 'type'),
  ])('fails closed for an unresolved local import: $specifier', async item => {
    const { errors } = audit({ imports: { 'entry.mts': [item] } })
    await expect(errors).resolves.toEqual([`entry.mts: ${item.specifier} does not resolve`])
  })

  it('allows third-party packages and CommonJS requires', async () => {
    const { errors } = audit({
      imports: {
        'entry.mts': [
          edge('zod', 'external'),
          edge('./required.mjs', 'unresolved', undefined, 'require'),
          edge('./resolved.mjs', 'resolved', 'resolved.mts', 'require-resolve'),
        ],
      },
    })
    await expect(errors).resolves.toEqual([])
  })

  it('reports a resolved import outside the traversed graph', async () => {
    const { errors } = audit({
      imports: { 'lib.mts': [edge('./dropped.mjs', 'resolved', 'dropped.mts', 'type')] },
    })
    await expect(errors).resolves.toEqual([
      'lib.mts: ./dropped.mjs resolves outside the traversed graph to dropped.mts',
    ])
  })

  it('reports a required file the traversal no longer reaches', async () => {
    const { errors } = audit({ requiredFiles: ['lib.mts', 'protected.mts'] })
    await expect(errors).resolves.toEqual(['protected.mts is missing from the traversed graph'])
  })

  it('reports tsconfig diagnostics before scanning', async () => {
    const { errors, scanned } = audit({
      diagnostics: [
        {
          kind: 'invalid-config',
          config: 'backend/tsconfig.json',
          file: null,
          detail: 'unexpected token',
          candidates: [],
        },
      ],
    })
    await expect(errors).resolves.toEqual([
      'backend/tsconfig.json: invalid-config unexpected token',
    ])
    expect(scanned).toEqual([])
  })
})
