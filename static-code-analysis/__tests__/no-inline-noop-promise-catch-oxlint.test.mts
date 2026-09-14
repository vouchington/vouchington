import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface Fixture {
  code: string
  file: string
  isValid: boolean
}

const OXLINT = resolve('node_modules/.bin/oxlint')
const NO_MISTAKES_PLUGIN = resolve('node_modules/eslint-plugin-no-mistakes')

const fixtures: Fixture[] = [
  {
    file: 'backend/empty.mts',
    isValid: false,
    code: 'task().catch(() => {})',
  },
  {
    file: 'backend/bare-return.mts',
    isValid: false,
    code: 'task().catch(() => { return })',
  },
  {
    file: 'backend/undefined.mts',
    isValid: false,
    code: 'task().catch(() => undefined)',
  },
  {
    file: 'backend/void.mts',
    isValid: false,
    code: 'task().catch(() => void 0)',
  },
  {
    file: 'backend/then-rejection-handler.mts',
    isValid: false,
    code: 'task().then(onFulfilled, () => {})',
  },
  {
    file: 'web/empty.ts',
    isValid: false,
    code: 'task().catch(() => {})',
  },
  {
    file: 'backend/named-handler.mts',
    isValid: true,
    code: 'task().catch(handleTaskFailure)',
  },
  {
    file: 'backend/logging-handler.mts',
    isValid: true,
    code: 'task().catch(error => logger.error(error))',
  },
  {
    file: 'backend/rethrow-handler.mts',
    isValid: true,
    code: 'task().catch(error => { throw error })',
  },
  {
    file: 'web/named-handler.ts',
    isValid: true,
    code: 'task().catch(handleTaskFailure)',
  },
  {
    file: 'backend/noop.test.mts',
    isValid: true,
    code: 'task().catch(() => {})',
  },
  {
    file: 'backend/noop.spec.mts',
    isValid: true,
    code: 'task().catch(() => {})',
  },
  {
    file: 'backend/__tests__/noop.mts',
    isValid: true,
    code: 'task().catch(() => {})',
  },
  {
    file: 'backend/test-helpers/noop.mts',
    isValid: true,
    code: 'task().catch(() => {})',
  },
  {
    file: 'static-code-analysis/out-of-scope.mts',
    isValid: true,
    code: 'task().catch(() => {})',
  },
]

describe('no-mistakes/no-inline-noop-promise-catch', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-no-inline-noop-promise-catch-'))
    for (const fixture of fixtures) {
      const path = join(root, fixture.file)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, fixture.code)
    }
    writeFileSync(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off', suspicious: 'off', perf: 'off' },
        jsPlugins: [{ name: 'no-mistakes', specifier: NO_MISTAKES_PLUGIN }],
        plugins: [],
        rules: {
          'no-mistakes/no-inline-noop-promise-catch': [
            'error',
            {
              allowedPathPatterns: [
                '**/*.test.*',
                '**/*.spec.*',
                '**/__tests__/**',
                '**/test-helpers/**',
              ],
              checkedPathPatterns: ['backend/**', 'web/**'],
            },
          ],
        },
      }),
    )
  })

  afterAll(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it('rejects inline no-op rejection callbacks while preserving observable and scoped handlers', () => {
    const result = spawnSync(OXLINT, ['-c', '.oxlintrc.json', '--format', 'json', '.'], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const { diagnostics } = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; filename: string }>
    }
    expect(
      diagnostics
        .filter(({ code }) => code === 'no-mistakes(no-inline-noop-promise-catch)')
        .map(({ filename }) => filename.replace(`${root}/`, ''))
        .toSorted(),
    ).toEqual(
      fixtures
        .filter(({ isValid }) => !isValid)
        .map(({ file }) => file)
        .toSorted(),
    )
  })
})
