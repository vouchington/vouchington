import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { symbols } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

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
  'analyzeProject',
  'check',
  'ciTopology',
  'ciTopologyImpact',
  'resolveCheck',
  'testsPlan',
  'validateMermaidMarkdown',
])

async function liveAnalysisImportNames(
  files: string[],
  root = repoRoot,
): Promise<Map<string, string[]>> {
  if (files.length === 0) return new Map()
  const result = await symbols({
    root,
    files,
    include: 'imports',
    timeout: 30,
    lockTimeout: 10,
    jobs: 1,
  })
  return new Map(
    result.files.map(file => [
      file.path,
      (file.imports ?? [])
        .filter(
          binding =>
            binding.source === 'no-mistakes' &&
            !binding.typeOnly &&
            LIVE_ANALYSIS_IMPORTS.has(binding.imported),
        )
        .map(binding => binding.imported),
    ]),
  )
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
  it('limits real invocations to static analysis', () => {
    const workflowCommands = readdirSync(`${repoRoot}/.github/workflows`)
      .filter(path => path.endsWith('.yml') || path.endsWith('.yaml'))
      .flatMap(path =>
        readRepoFile(`.github/workflows/${path}`)
          .split('\n')
          .map(line => line.trim())
          .filter(line =>
            /^(?:run:\s*)?(?:pnpm (?:run|exec) no-mistakes\b.*|node ci\/check-live-workflow-topology\.mts)$/.test(
              line,
            ),
          )
          .map(command => ({ path, command })),
      )
      .toSorted((a, b) => a.path.localeCompare(b.path))

    expect(workflowCommands).toEqual([
      {
        path: 'static-code-analysis.yml',
        command:
          'run: pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
      },
      {
        path: 'static-code-analysis.yml',
        command: 'run: node ci/check-live-workflow-topology.mts',
      },
    ])
  })

  it('keeps route-selector unit tests off the live graph', () => {
    expect(
      readRepoFile('static-code-analysis/i18n-extract/route-selector-map.test.mts'),
    ).not.toMatch(/\bcomputeRouteAliasMap\b/)
  })

  it('does not invoke live no-mistakes analysis from Vitest tests', async () => {
    const imports = await liveAnalysisImportNames(
      policySubjectFiles().filter(
        path => !/\.mock\.test\./u.test(path) && readRepoFile(path).includes('no-mistakes'),
      ),
    )
    expect(
      policySubjectFiles().flatMap(path => {
        const source = readRepoFile(path)
        const hits = spawnsNoMistakesCli(source) ? ['cli'] : []
        if (/\.mock\.test\./u.test(path)) {
          return hits.length > 0 ? [`${path}:${hits.join(',')}`] : []
        }
        hits.push(...(imports.get(path) ?? []).map(name => `import:${name}`))
        return hits.length > 0 ? [`${path}:${hits.join(',')}`] : []
      }),
    ).toEqual([])
  })

  it('selects runtime named imports from the SDK module at their original names', async () => {
    const root = mkdtempSync(join(tmpdir(), 'live-analysis-imports-'))
    try {
      writeFileSync(
        join(root, 'imports.mts'),
        [
          "import { check as runCheck, type CheckOptions } from 'no-mistakes'",
          "import type { analyzeProject } from 'no-mistakes'",
          "import { type ciTopology, symbols } from 'no-mistakes'",
          "import { 'resolveCheck' as resolver, '\\u0063heck' as checker } from 'no-mistakes'",
          "import defaultApi from 'no-mistakes'",
          "import * as namespaceApi from 'no-mistakes'",
          "import { check } from 'other-module'",
          "const dynamic = import('no-mistakes')",
          "const { testsPlan } = require('no-mistakes')",
          "export { ciTopologyImpact } from 'no-mistakes'",
          "import requiredApi = require('no-mistakes')",
        ].join('\n'),
      )
      expect(await liveAnalysisImportNames([], root)).toEqual(new Map())
      expect(await liveAnalysisImportNames(['imports.mts'], root)).toEqual(
        new Map([['imports.mts', ['check', 'resolveCheck', 'check']]]),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not load live topology from Vitest tests', () => {
    expect(
      policySubjectFiles().filter(path => /await loadRepoTopology\(\)/u.test(readRepoFile(path))),
    ).toEqual([])
  })
})
