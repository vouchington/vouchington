import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const OXLINT = resolve('node_modules/.bin/oxlint')
const CONFIG = resolve('.oxlintrc.json')
const RULES = ['typescript(no-base-to-string)', 'typescript(no-misused-spread)']

describe('semantic string and spread Oxlint policy', () => {
  it('enables both rules at error severity in the root config', () => {
    const parsed = ts.readConfigFile(CONFIG, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const rules = parsed.config.rules as Record<string, string>
    expect(rules['typescript/no-base-to-string']).toBe('error')
    expect(rules['typescript/no-misused-spread']).toBe('error')
  })

  it('rejects base object stringification and class-instance spread but accepts explicit values', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-semantic-oxlint-'))
    try {
      writeFileSync(
        join(root, 'tsconfig.json'),
        '{"compilerOptions":{"strict":true},"include":["*.ts"]}',
      )
      writeFileSync(
        join(root, '.oxlintrc.json'),
        '{"rules":{"typescript/no-base-to-string":"error","typescript/no-misused-spread":"error"}}',
      )
      writeFileSync(
        join(root, 'bad.ts'),
        'class Value { count = 1 }\nexport const text = String(new Value())\nexport const copy = { ...new Value() }\n',
      )
      writeFileSync(
        join(root, 'good.ts'),
        'export const text = String(1)\nexport const copy = { ...{ count: 1 } }\n',
      )

      const result = spawnSync(
        OXLINT,
        ['--config', '.oxlintrc.json', '--type-aware', '--format', 'json', '.'],
        { cwd: root, encoding: 'utf8' },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      const { diagnostics } = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string; filename: string }>
      }
      expect(
        diagnostics
          .filter(({ code }) => RULES.includes(code))
          .map(({ code, filename }) => ({ code, file: filename.replace(`${root}/`, '') }))
          .toSorted((a, b) => a.code.localeCompare(b.code)),
      ).toEqual([
        { code: 'typescript(no-base-to-string)', file: 'bad.ts' },
        { code: 'typescript(no-misused-spread)', file: 'bad.ts' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
