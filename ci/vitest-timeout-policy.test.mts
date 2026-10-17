import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse as parseJsonc } from 'jsonc-parser'
import { describe, expect, it } from 'vitest'
import config from '../vitest.config.mts'
import {
  ChildCommandCleanupError,
  runChildCommand,
} from '../static-code-analysis/child-command.mts'
import { createFixtureDeadline } from '../static-code-analysis/test-helpers/fixture-deadline.mts'
import { fixtures } from './test-helpers/vitest-timeout-policy-fixtures.mts'

const binary = resolve('node_modules/.bin/oxlint')
const require = createRequire(resolve('.oxlintrc.json'))

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

type NativeReport = { diagnostics: { code: string; filename: string }[] }

async function analyzeFixture(configPath: string, prepare: (root: string) => string[]) {
  const remaining = createFixtureDeadline()
  const root = mkdtempSync(join(tmpdir(), 'vitest-timeout-policy-'))
  const errors: unknown[] = []
  let removalSafe = true
  let result: { root: string; status: number; report: NativeReport } | undefined
  try {
    const config = writeFixtureConfig(configPath, root)
    const files = prepare(root)
    const output = join(root, 'native-report.json')
    let status = 0
    try {
      await runChildCommand(
        '/bin/sh',
        [
          '-c',
          'output=$1; shift; exec "$@" > "$output"',
          'vitest-timeout-fixture',
          output,
          binary,
          '--config',
          config,
          '--format',
          'json',
          ...files,
        ],
        root,
        remaining,
      )
    } catch (err) {
      if (err instanceof ChildCommandCleanupError) {
        removalSafe = false
        throw err
      }
      if (!(err instanceof Error && 'code' in err && err.code === 1)) throw err
      status = 1 // The real native lint-finding exit, not an execution/cleanup failure.
    }
    const report = JSON.parse(readFileSync(output, 'utf8')) as NativeReport
    expect(Array.isArray(report.diagnostics)).toBe(true)
    remaining()
    result = { root, status, report }
  } catch (err) {
    errors.push(err)
  } finally {
    if (removalSafe) {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch (err) {
        errors.push(err)
      }
    } else {
      console.error('Owned native fixture retained after unconfirmed process-group cleanup', root)
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Timeout fixture and cleanup failed', { cause: errors[0] })
  if (result === undefined) throw new Error('Native timeout fixture did not produce a report')
  return result
}

describe('native tooling Vitest timeout policy', () => {
  it.each([
    { source: 'export default defineConfig({ test: { testTimeout: 30001 } })', rejected: true },
    { source: 'export default defineConfig({ test: { hookTimeout: 30000 } })', rejected: false },
    { source: 'vi.setConfig({ testTimeout: Number(process.env.DEADLINE) })', rejected: true },
    {
      source:
        "import { beforeAll } from 'vitest'; beforeAll(() => {}, Number(process.env.DEADLINE))",
      rejected: true,
    },
  ])('root config deferral preserves native checks for $source', async ({ source, rejected }) => {
    const { report } = await analyzeFixture('.oxlintrc.json', root => {
      writeFileSync(
        join(root, 'vitest.config.mts'),
        `import { defineConfig } from 'vitest/config'; import { vi } from 'vitest'; ${source}`,
      )
      return ['vitest.config.mts']
    })
    expect(report.diagnostics.some(item => item.code === 'no-mistakes(vitest-timeout-cap)')).toBe(
      rejected,
    )
  })

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
    async configPath => {
      const { root, status, report } = await analyzeFixture(configPath, root => {
        for (const fixture of fixtures) {
          const file = join(root, fixture.path)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, fixture.source)
        }
        return ['.']
      })
      expect(status).toBe(1)
      expect(
        report.diagnostics
          .filter(item => item.code === 'no-mistakes(vitest-timeout-cap)')
          .map(item =>
            item.filename.startsWith(`${root}/`)
              ? item.filename.slice(root.length + 1)
              : item.filename,
          )
          .toSorted(),
      ).toEqual(
        fixtures
          .filter(
            fixture =>
              fixture.rejected &&
              !(
                configPath === '.oxlintrc.json' &&
                'allowedByRootMaximum' in fixture &&
                fixture.allowedByRootMaximum
              ),
          )
          .flatMap(fixture =>
            Array.from(
              {
                length: 'diagnosticsWhenRejected' in fixture ? fixture.diagnosticsWhenRejected : 1,
              },
              () => fixture.path,
            ),
          )
          .toSorted(),
      )
    },
  )
})
