import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'

const binary = resolve('node_modules/.bin/oxlint')
const require = createRequire(resolve('.oxlintrc.json'))
const fixtures = [
  {
    path: 'backend/test-helpers/other-project.test.mts',
    source: "import { it } from 'vitest'; it('outside this project', () => {}, 30001)",
    rejected: true,
    excludedFromRootScope: true,
  },
  {
    path: 'test-helpers/alias.test.mts',
    source: "import { it as check } from 'vitest'; check('slow', () => {}, 30 * 1000 + 1)",
    rejected: true,
  },
  {
    path: 'test-helpers/runtime.test.mts',
    source: "import { vi as runtime } from 'vitest'; runtime.setConfig({ testTimeout: 30001 })",
    rejected: true,
  },
  {
    path: 'test-helpers/unknown.test.mts',
    source: "import { afterEach } from 'vitest'; afterEach(() => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: 'test-helpers/bounded.test.mts',
    source: "import { it } from 'vitest'; it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: '.pr-shepherd/__tests__/unknown.test.mts',
    source: "import { it } from 'vitest'; it('unknown', () => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: '.agents/catalog/hook.test.mts',
    source: "import { afterEach } from 'vitest'; afterEach(() => {}, 30001)",
    rejected: true,
  },
  {
    path: '.github/workflows/deadline.test.mts',
    source: "import { it as check } from 'vitest'; check('slow', () => {}, 30 * 1000 + 1)",
    rejected: true,
  },
  {
    path: 'backend/dependency-cruiser-rules/slow.test.mts',
    source: "import { it } from 'vitest'; it('slow', { timeout: 30001 }, () => {})",
    rejected: true,
  },
  {
    path: 'backend/dependency-cruiser-rules/bounded.test.mts',
    source: "import { it } from 'vitest'; it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: '.husky/alias.test.mts',
    source: "import { it as check } from 'vitest'; check('slow', () => {}, 30 * 1000 + 1)",
    rejected: true,
  },
  {
    path: '.husky/unknown.test.mts',
    source:
      "import { beforeEach } from 'vitest'; beforeEach(() => {}, Number(process.env.DEADLINE))",
    rejected: true,
  },
  {
    path: '.husky/runtime.test.mts',
    source: "import { vi } from 'vitest'; vi.setConfig({ testTimeout: 30001 })",
    rejected: true,
  },
  {
    path: '.husky/bounded.test.mts',
    source:
      "import { it, afterEach, vi } from 'vitest'; vi.setConfig({ testTimeout: 30000 }); afterEach(() => {}, 30000); it('bounded', { timeout: 30000 }, () => {})",
    rejected: false,
  },
  {
    path: 'ci/alias.test.mts',
    source:
      "import { it as check } from 'vitest'; const seconds = 60; check('slow', () => {}, seconds * 1000)",
    rejected: true,
  },
  {
    path: 'dev/hook.test.mts',
    source: "import { beforeEach as setup } from 'vitest'; setup(() => {}, 30001)",
    rejected: true,
  },
  {
    path: 'static-code-analysis/table.test.mts',
    source: "import { test } from 'vitest'; test.each([1])('slow', { timeout: 30001 }, () => {})",
    rejected: true,
  },
  {
    path: 'ci/runtime.test.mts',
    source: "import { vi as runtime } from 'vitest'; runtime.setConfig({ testTimeout: 0 })",
    rejected: true,
  },
  {
    path: 'ci/unknown.test.mts',
    source:
      "import { it } from 'vitest'; const deadline = Number(process.env.DEADLINE); it('unknown', () => {}, deadline)",
    rejected: true,
  },
  {
    path: 'dev/config.mts',
    source:
      "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { testTimeout: 5001 } })",
    rejected: true,
  },
  {
    path: 'ci/bounded.test.mts',
    source:
      "import { it, beforeEach } from 'vitest'; const timeout = 30 * 1000; beforeEach(() => {}, timeout); it('bounded', { timeout }, () => {})",
    rejected: false,
  },
  {
    path: 'dev/known-config.mts',
    source:
      "import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { testTimeout: 5000, hookTimeout: 5000 } })",
    rejected: false,
  },
  {
    path: 'static-code-analysis/unrelated.mts',
    source:
      'const client = { test(_name, _options, _callback) {} }; client.test("request", { timeout: 60000 }, () => {})',
    rejected: false,
  },
] as const

function writeFixtureConfig(configPath: string, root: string): string {
  for (const path of new Set(['.oxlintrc.json', configPath])) {
    const config = parseJsonc(readFileSync(path, 'utf8')) as {
      jsPlugins?: Array<string | { name: string; specifier: string }>
    }
    config.jsPlugins = config.jsPlugins?.map(plugin =>
      typeof plugin === 'string'
        ? { name: plugin.replace(/^eslint-plugin-/, ''), specifier: require.resolve(plugin) }
        : { ...plugin, specifier: require.resolve(plugin.specifier) },
    )
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(config))
  }
  return join(root, configPath)
}

describe('native tooling Vitest timeout policy', () => {
  it('resolves five-second defaults for the isolated static-analysis fixture project', () => {
    const projects = (config.test?.projects ?? []).filter(
      project =>
        typeof project === 'object' &&
        'test' in project &&
        project.test?.name === 'static-analysis-ast-grep',
    )
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      extends: true,
      test: {
        testTimeout: 5_000,
        hookTimeout: 5_000,
        isolate: true,
        setupFiles: ['./test-helpers/vitest.setup.tooling-isolated-env.mts'],
      },
    })
  })

  it.each(['.oxlintrc.json', 'ci/.oxlintrc.json', 'static-code-analysis/.oxlintrc.json'])(
    '%s rejects unsafe framework carriers without rejecting bounded or unrelated calls',
    configPath => {
      const root = mkdtempSync(join(tmpdir(), 'tooling-timeout-policy-'))
      try {
        const config = writeFixtureConfig(configPath, root)
        for (const fixture of fixtures) {
          const file = join(root, fixture.path)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, fixture.source)
        }
        const result = spawnSync(binary, ['--config', config, '--format', 'json', '.'], {
          cwd: root,
          encoding: 'utf8',
          timeout: 5000,
        })
        expect(result.error).toBeUndefined()
        expect(result.signal).toBeNull()
        expect(result.status).toBe(1)
        const report = JSON.parse(result.stdout) as {
          diagnostics: { code: string; filename: string }[]
        }
        expect(
          report.diagnostics
            .filter(item => item.code === 'no-mistakes(vitest-timeout-cap)')
            .map(item => item.filename.replace(`${root}/`, ''))
            .toSorted(),
        ).toEqual(
          fixtures
            .filter(
              fixture =>
                fixture.rejected &&
                !(
                  configPath === '.oxlintrc.json' &&
                  'excludedFromRootScope' in fixture &&
                  fixture.excludedFromRootScope
                ),
            )
            .map(fixture => fixture.path)
            .toSorted(),
        )
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
