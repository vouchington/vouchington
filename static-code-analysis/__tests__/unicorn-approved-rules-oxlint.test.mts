import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const OXLINT = resolve('node_modules/.bin/oxlint')
const CONFIG = resolve('.oxlintrc.json')
const CASES = [
  {
    rule: 'no-array-fill-with-reference-type',
    rejected: 'export const batch = new Array(2).fill({})\n',
    accepted:
      'export const batch = Array.from({ length: 2 }, () => ({}))\nexport const flags = new Array(2).fill(false)\n',
  },
  {
    rule: 'prefer-array-find',
    rejected: 'const values = [1, 2]\nexport const first = values.filter(value => value > 0)[0]\n',
    accepted:
      'const values = [1, 2]\nexport const first = values.find(value => value > 0)\nexport const matches = values.filter(value => value > 0)\n',
  },
  {
    rule: 'no-array-reverse',
    rejected: 'const values = [1, 2]\nexport const reversed = values.reverse()\n',
    accepted:
      'const values = [1, 2]\nvalues.reverse()\nexport const reversed = values.toReversed()\n',
  },
  {
    rule: 'no-anonymous-default-export',
    rejected: 'export default () => "CREATE TABLE example (id UUID);"\n',
    accepted:
      'export default function generateSchemaSql() { return "CREATE TABLE example (id UUID);" }\n',
  },
]

describe('approved Unicorn Oxlint policy', () => {
  it.each(CASES)('enforces $rule with the root configuration', ({ rule, rejected, accepted }) => {
    const parsed = ts.readConfigFile(CONFIG, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const setting = (parsed.config.rules as Record<string, unknown>)[`unicorn/${rule}`]
    expect(setting).toBe('error')
    const root = mkdtempSync(join(tmpdir(), 'voucha-approved-unicorn-'))
    try {
      writeFileSync(
        join(root, '.oxlintrc.json'),
        JSON.stringify({ plugins: ['unicorn'], rules: { [`unicorn/${rule}`]: setting } }),
      )
      writeFileSync(join(root, 'rejected.ts'), rejected)
      writeFileSync(join(root, 'accepted.ts'), accepted)
      writeFileSync(join(root, 'config.ts'), 'export default { enabled: true }\n')
      const result = spawnSync(OXLINT, ['--format', 'json', '.'], { cwd: root, encoding: 'utf8' })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      const { diagnostics } = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string; filename: string; severity: string }>
      }
      expect(
        diagnostics
          .filter(({ code }) => code === `unicorn(${rule})`)
          .map(({ filename, severity }) => ({ file: filename.replace(`${root}/`, ''), severity })),
      ).toEqual([{ file: 'rejected.ts', severity: 'error' }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
