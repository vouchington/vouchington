import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { playwrightPlanOptions } from './playwright/ci-select.mts'
import { vitestPlanOptions } from './vitest/ci-select.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoFileCache = new Map<string, string>()
let cachedPolicySubjectFiles: string[] | undefined

function readRepoFile(path: string): string {
  const cached = repoFileCache.get(path)
  if (cached !== undefined) return cached
  const source = readFileSync(`${repoRoot}/${path}`, 'utf8')
  repoFileCache.set(path, source)
  return source
}

function trackedTestFiles(): string[] {
  return execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', '--cached'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
    .split('\0')
    .filter(
      path => /\.(?:mock\.)?test\.[cm]?[jt]sx?$/u.test(path) && existsSync(`${repoRoot}/${path}`),
    )
    .toSorted()
}

function policySubjectFiles(): string[] {
  return (cachedPolicySubjectFiles ??= trackedTestFiles().filter(
    path => path !== 'ci/no-mistakes-ci-contention.test.mts',
  ))
}

const LIVE_ANALYSIS_IMPORTS = new Set([
  'check',
  'ciTopology',
  'ciTopologyImpact',
  'testsPlan',
  'validateMermaidMarkdown',
])

const LIVE_ADAPTER_CALLS =
  /\b(?:selectTopology|planTests|ciTopologyImpact|validatePlanMermaidMarkdown)\(/u

function liveAnalysisImportNames(source: string): string[] {
  if (!source.includes('no-mistakes')) return []
  const file = ts.createSourceFile('test.mts', source, ts.ScriptTarget.Latest, true)
  const names: string[] = []
  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'no-mistakes' &&
      node.importClause !== undefined &&
      !node.importClause.isTypeOnly &&
      node.importClause.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        if (element.isTypeOnly) continue
        const name = (element.propertyName ?? element.name).text
        if (LIVE_ANALYSIS_IMPORTS.has(name)) names.push(name)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return names
}

function spawnsNoMistakesCli(source: string): boolean {
  return (
    /join\([^)]*['"]node_modules\/\.bin\/no-mistakes['"]/u.test(source) ||
    /\b(?:spawnSync|execFileSync|execFile)\(\s*(?:noMistakes(?:Binary)?|NO_MISTAKES_BIN|['"]no-mistakes['"])/u.test(
      source,
    ) ||
    /\b(?:spawnSync|execFileSync|execFile)\(\s*['"]pnpm(?:\.cmd)?['"][\s\S]{0,300}['"]no-mistakes['"]/u.test(
      source,
    )
  )
}

describe('no-mistakes CI contention policy', () => {
  it('limits real invocations to static analysis and centralized test selection', () => {
    const workflowCommands = readdirSync(`${repoRoot}/.github/workflows`)
      .filter(path => path.endsWith('.yml') || path.endsWith('.yaml'))
      .flatMap(path =>
        readRepoFile(`.github/workflows/${path}`)
          .split('\n')
          .map(line => line.trim())
          .filter(line =>
            /^(?:run:\s*)?(?:pnpm (?:run|exec) no-mistakes\b.*|node ci\/(?:vitest|playwright)\/ci-select\.mts|node ci\/check-live-workflow-topology\.mts)$/.test(
              line,
            ),
          )
          .map(command => ({ path, command })),
      )
      .toSorted((a, b) => a.path.localeCompare(b.path))

    expect(workflowCommands).toEqual([
      { path: 'ci-select-vitest.yml', command: 'run: node ci/vitest/ci-select.mts' },
      {
        path: 'static-code-analysis.yml',
        command:
          'run: pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
      },
      {
        path: 'static-code-analysis.yml',
        command: 'run: node ci/check-live-workflow-topology.mts',
      },
      { path: 'tests-playwright.yml', command: 'run: node ci/playwright/ci-select.mts' },
    ])
  })

  it('disables execution and lock deadlines for centralized test selection', () => {
    expect(vitestPlanOptions(process.cwd(), 'main')).toEqual(
      expect.objectContaining({ lockTimeout: 0, timeout: 0 }),
    )
    expect(playwrightPlanOptions(process.cwd(), 'main')).toEqual(
      expect.objectContaining({ lockTimeout: 0, timeout: 0 }),
    )
  })

  it('does not invoke live no-mistakes analysis from Vitest tests', () => {
    expect(
      policySubjectFiles().flatMap(path => {
        const source = readRepoFile(path)
        const hits = spawnsNoMistakesCli(source) ? ['cli'] : []
        if (/\.mock\.test\./u.test(path)) {
          return hits.length > 0 ? [`${path}:${hits.join(',')}`] : []
        }
        hits.push(
          ...liveAnalysisImportNames(source).map(name => `import:${name}`),
          ...(LIVE_ADAPTER_CALLS.test(source) ? ['adapter-call'] : []),
        )
        return hits.length > 0 ? [`${path}:${hits.join(',')}`] : []
      }),
    ).toEqual([])
  })

  it('does not load live topology from Vitest tests', () => {
    expect(
      policySubjectFiles().filter(path => /await loadRepoTopology\(\)/u.test(readRepoFile(path))),
    ).toEqual([])
  })
})
