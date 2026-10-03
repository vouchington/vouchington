import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const oxlint = resolve('node_modules/.bin/oxlint')
const config = resolve('.oxlintrc.json')
const rule = 'eslint(radix)'

describe('radix Oxlint policy', () => {
  it('enables the rule at error severity in the root config', () => {
    const parsed = ts.readConfigFile(config, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const rules = parsed.config.rules as Record<string, string>
    expect(rules.radix).toBe('error')
  })

  it('rejects parseInt calls that omit a radix and accepts an explicit radix', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-radix-oxlint-'))
    const bad = join(root, 'bad.ts')
    const good = join(root, 'good.ts')
    try {
      writeFileSync(
        bad,
        "export const value = Number.parseInt('08')\nexport const legacy = parseInt('10')\n",
      )
      writeFileSync(
        good,
        "export const value = Number.parseInt('08', 10)\nexport const hex = parseInt('ff', 16)\n",
      )

      const result = spawnSync(oxlint, ['--config', config, '--format', 'json', bad, good], {
        encoding: 'utf8',
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      const { diagnostics } = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string; filename: string }>
      }
      expect(
        diagnostics
          .filter(({ code }) => code === rule)
          .map(({ filename }) => filename.replace(`${root}/`, ''))
          .toSorted(),
      ).toEqual(['bad.ts', 'bad.ts'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
