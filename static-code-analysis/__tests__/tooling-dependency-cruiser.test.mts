import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  TOOLING_DEPENDENCY_CRUISER_ROOTS,
  buildToolingDependencyCruiserArgs,
  parseToolingDependencyCruiserCliArgs,
  runToolingDependencyCruiser,
} from '../run-tooling-dependency-cruiser.mts'

type DependencyCruiserRule = {
  from?: { path?: string }
}

type DependencyCruiserConfig = {
  forbidden: DependencyCruiserRule[]
}

const require = createRequire(import.meta.url)
const dependencyCruiserConfig = require('../../.dependency-cruiser.cjs') as DependencyCruiserConfig

describe('tooling dependency-cruiser runner', () => {
  it('owns every repo-tooling source root', () => {
    expect(TOOLING_DEPENDENCY_CRUISER_ROOTS).toEqual([
      'ci',
      'dev/agent-issue-labels',
      'dev/agent-policy',
      'dev/agent-policy.mts',
      'dev/pr-description',
      'static-code-analysis',
    ])
  })

  it('builds deterministic local and content-cache arguments', () => {
    expect(buildToolingDependencyCruiserArgs({ cache: false })).toEqual([
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err',
      ...TOOLING_DEPENDENCY_CRUISER_ROOTS,
    ])
    expect(buildToolingDependencyCruiserArgs({ cache: true })).toEqual([
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'err',
      '--cache',
      '--cache-strategy',
      'content',
      ...TOOLING_DEPENDENCY_CRUISER_ROOTS,
    ])
  })

  it('rejects unsupported command-line arguments', () => {
    expect(parseToolingDependencyCruiserCliArgs([])).toEqual({ cache: false })
    expect(parseToolingDependencyCruiserCliArgs(['--cache'])).toEqual({ cache: true })
    expect(() => parseToolingDependencyCruiserCliArgs(['--unknown'])).toThrow(
      'Unknown tooling dependency-cruiser argument: --unknown',
    )
  })

  it('executes dependency-cruiser without a shell', () => {
    let invocation: unknown
    const exitCode = runToolingDependencyCruiser(['--cache'], (command, args, options) => {
      invocation = { command, args, options }
      return { status: 0 }
    })

    expect(exitCode).toBe(0)
    expect(invocation).toEqual({
      command: 'pnpm',
      args: ['exec', 'depcruise', ...buildToolingDependencyCruiserArgs({ cache: true })],
      options: { shell: false, stdio: 'inherit' },
    })
  })

  it('keeps every declared root in scope for at least one configured boundary', () => {
    const representativePaths = [
      'ci/example.mts',
      'dev/agent-issue-labels/example.mts',
      'dev/agent-policy/example.mts',
      'dev/agent-policy.mts',
      'dev/pr-description/example.mts',
      'static-code-analysis/example.mts',
    ]
    const configuredFromPatterns = dependencyCruiserConfig.forbidden.flatMap(rule =>
      rule.from?.path ? [new RegExp(rule.from.path)] : [],
    )

    for (const path of representativePaths) {
      expect(configuredFromPatterns.some(pattern => pattern.test(path))).toBe(true)
    }
  })

  it('makes package, workflow, and ci-local callers invoke the same runner', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    const workflow = readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')
    const ciLocalTargets = readFileSync('ci/ci-local/static-commands.mts', 'utf8')
    const command = 'node static-code-analysis/run-tooling-dependency-cruiser.mts'

    expect(packageJson.scripts['dep-cruise:scripts']).toContain(command)
    expect(workflow).toContain(`${command} --cache`)
    expect(ciLocalTargets).toContain(command)
    expect(workflow).not.toContain(
      'ci dev/agent-issue-labels dev/pr-description static-code-analysis',
    )
    expect(ciLocalTargets).not.toContain(
      'ci dev/agent-issue-labels dev/pr-description static-code-analysis',
    )
  })
})

describe('production test-helper dependency boundary', () => {
  const rules = require('../production-test-helper-boundary.cjs') as DependencyCruiserRule[]

  it('is installed in each owning graph', () => {
    const configs = [
      require('../../.dependency-cruiser.cjs'),
      require('../../backend/.dependency-cruiser.cjs'),
      require('../../web/.dependency-cruiser.cjs'),
      require('../../lambdas/.dependency-cruiser.cjs'),
    ] as { forbidden: DependencyCruiserRule[] }[]
    for (const config of configs) {
      for (const rule of rules) expect(config.forbidden).toContainEqual(rule)
    }
  })

  it('rejects resolved runtime edges and limits exact runner exceptions to Vitest config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'production-helper-boundary-'))
    const sources = {
      'backend/test-helpers/value.mts': 'export const value = 1; export type Value = number',
      'web/test-helpers/value.ts': 'export const value = 1',
      'ci/test-helpers/value.mts': 'export const value = 1',
      'test-helpers/vitest-config/value.mts': 'export const value = 1',
      'backend/api/relative.mts': "export { value } from '../test-helpers/value.mts'",
      'backend/services/alias.mts':
        "import type { Value } from '@voucha/test-helpers/value'; export type Result = Value",
      'web/app/page.ts': "export { value } from '@/test-helpers/value'",
      'lambdas/handler.mts': "export { value } from '../backend/test-helpers/value.mts'",
      'ci/check-runtime.mts': "export { value } from './test-helpers/value.mts'",
      'ci/check-coverage-scope.mts':
        "export { value } from '../test-helpers/vitest-config/value.mts'",
      'ci/check-storybook-browser-optimize-deps.mts':
        "export { value } from './test-helpers/value.mts'",
      'backend/api/control.test.mts': "export { value } from '../test-helpers/value.mts'",
      'web/storybook/control.stories.ts': "export { value } from '../test-helpers/value'",
      'backend/services/ordinary.mts': 'export const value = 1',
      'backend/data-stores/psql/index.mts': 'export const value = 1',
      'backend/data-stores/valkey-core/index.mts': 'export const value = 1',
      'backend/data-stores/graceful-shutdown/index.mts': 'export const shutdown = 1',
      'backend/scripts/generate-mcp-catalog.mts':
        "export { value } from '../data-stores/valkey-core/index.mts'; export { shutdown } from '../data-stores/graceful-shutdown/index.mts'",
      'backend/scripts/other-generator.mts':
        "export { value } from '../data-stores/valkey-core/index.mts'",

      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@voucha/test-helpers/*': ['backend/test-helpers/*.mts'],
            '@/test-helpers/*': ['web/test-helpers/*'],
          },
        },
      }),
    }
    try {
      for (const [path, source] of Object.entries(sources)) {
        const target = join(root, path)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, source)
      }
      await writeFile(
        join(root, 'dependency-rules.cjs'),
        `module.exports = { forbidden: [...require(${JSON.stringify(fileURLToPath(new URL('../production-test-helper-boundary.cjs', import.meta.url)))}), ...require(${JSON.stringify(fileURLToPath(new URL('../../backend/dependency-cruiser-rules/data-stores-primary.cjs', import.meta.url)))})], options: { tsConfig: { fileName: 'tsconfig.json' }, tsPreCompilationDeps: true } }`,
      )
      const result = spawnSync(
        fileURLToPath(new URL('../../node_modules/.bin/dependency-cruiser', import.meta.url)),
        [
          '--config',
          'dependency-rules.cjs',
          '--output-type',
          'json',
          'backend',
          'web',
          'lambdas',
          'ci',
        ],
        { cwd: root, encoding: 'utf8' },
      )
      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const output = JSON.parse(result.stdout) as {
        summary: { violations: { from: string }[] }
        modules: {
          source: string
          dependencies: { module: string; resolved: string; couldNotResolve: boolean }[]
        }[]
      }
      expect(
        output.modules.find(module => module.source === 'backend/services/alias.mts')?.dependencies,
      ).toContainEqual(
        expect.objectContaining({
          module: '@voucha/test-helpers/value',
          resolved: 'backend/test-helpers/value.mts',
          couldNotResolve: false,
        }),
      )
      await writeFile(
        join(root, 'backend/scripts/generate-mcp-catalog.mts'),
        `${sources['backend/scripts/generate-mcp-catalog.mts']}; export { value as psql } from '../data-stores/psql/index.mts'`,
      )
      const failing = spawnSync(
        fileURLToPath(new URL('../../node_modules/.bin/dependency-cruiser', import.meta.url)),
        [
          '--config',
          'dependency-rules.cjs',
          '--output-type',
          'err',
          'backend',
          'web',
          'lambdas',
          'ci',
        ],
        { cwd: root, encoding: 'utf8' },
      )
      expect(failing.status).toBeGreaterThan(0)
      expect(failing.stdout + failing.stderr).toContain('mcp-catalog-cli-datastore-lifecycle-only')
      expect(failing.stdout + failing.stderr).toContain('backend/data-stores/psql/index.mts')
      expect(output.summary.violations.map(violation => violation.from).toSorted()).toEqual([
        'backend/api/relative.mts',
        'backend/scripts/other-generator.mts',
        'backend/services/alias.mts',
        'ci/check-runtime.mts',
        'ci/check-storybook-browser-optimize-deps.mts',
        'lambdas/handler.mts',
        'web/app/page.ts',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
