import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ts from 'typescript'

const OXLINT = resolve('node_modules/.bin/oxlint')
const ROOT_CONFIG = resolve('.oxlintrc.json')
const WEB_CONFIG = resolve('web/.oxlintrc.json')
const EXPLICIT_ANY = 'export const value: any = 1\n'

const fixturePaths = [
  'web/app/source.ts',
  'web/app/source.test.ts',
  'web/app/source.spec.ts',
  'web/app/__tests__/source.ts',
  'web/test-helpers/source.ts',
  'web/app/source.stories.tsx',
] as const

describe('typescript/no-explicit-any production policy', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-no-explicit-any-'))
    for (const path of fixturePaths) {
      const file = join(root, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, EXPLICIT_ANY)
    }
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('enables the root rule and limits exemptions to test and mock paths', () => {
    const parsed = ts.readConfigFile(ROOT_CONFIG, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const config = parsed.config as {
      rules: Record<string, string>
      overrides: Array<{ files?: string[]; rules?: Record<string, string> }>
    }
    expect(config.rules['typescript/no-explicit-any']).toBe('error')
    expect(
      config.overrides.filter(override => override.rules?.['typescript/no-explicit-any'] === 'off'),
    ).toEqual([
      expect.objectContaining({
        files: [
          '**/*.test.{mts,ts,tsx}',
          '**/*.spec.{mts,ts,tsx}',
          '**/__tests__/**/*.{mts,ts,tsx}',
          '**/test-helpers/**',
        ],
      }),
    ])
  })

  it('rejects production any in web while exempting test and mock fixtures', () => {
    const cwd = join(root, 'web')
    const result = spawnSync(OXLINT, ['--config', WEB_CONFIG, '--format', 'json', '.'], {
      cwd,
      encoding: 'utf8',
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const { diagnostics } = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string; filename: string }>
    }
    expect(
      diagnostics
        .filter(({ code }) => code === 'typescript(no-explicit-any)')
        .map(({ filename }) => filename.replace(`${cwd}/`, ''))
        .toSorted(),
    ).toEqual(['app/source.stories.tsx', 'app/source.ts'])
  })
})
