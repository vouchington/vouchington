import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const OXLINT = resolve('node_modules/.bin/oxlint')
const CONFIG = resolve('.oxlintrc.json')
const RULE = 'unicorn(prefer-array-some)'

describe('unicorn/prefer-array-some Oxlint policy', () => {
  it('enables the rule at error severity in the root config', () => {
    const parsed = ts.readConfigFile(CONFIG, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const rules = parsed.config.rules as Record<string, string>
    expect(rules['unicorn/prefer-array-some']).toBe('error')
  })

  it('rejects filter-only boolean checks and accepts reuse of the filtered values', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-unicorn-prefer-array-some-'))
    try {
      writeFileSync(
        join(root, '.oxlintrc.json'),
        JSON.stringify({
          plugins: ['unicorn'],
          rules: { 'unicorn/prefer-array-some': 'error' },
        }),
      )
      writeFileSync(
        join(root, 'bad.ts'),
        'export const hasValue = values.filter(value => value.length > 0).length > 0\n',
      )
      writeFileSync(
        join(root, 'good.ts'),
        'const filtered = values.filter(value => value.length > 0)\nexport const result = filtered.length > 0 ? { values: filtered } : {}\n',
      )

      const result = spawnSync(OXLINT, ['--config', '.oxlintrc.json', '--format', 'json', '.'], {
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
          .filter(({ code }) => code === RULE)
          .map(({ filename }) => filename.replace(`${root}/`, '')),
      ).toEqual(['bad.ts'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
