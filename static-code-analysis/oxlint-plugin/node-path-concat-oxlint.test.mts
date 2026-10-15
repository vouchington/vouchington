import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import ts from 'typescript'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFixtureDeadline } from '../test-helpers/fixture-deadline.mts'

let remaining: ReturnType<typeof createFixtureDeadline>

const oxlint = resolve('node_modules/.bin/oxlint')
const config = resolve('.oxlintrc.json')
const rule = 'node(no-path-concat)'

describe('node/no-path-concat Oxlint policy', () => {
  beforeEach(() => {
    remaining = createFixtureDeadline()
  })

  it('enables the rule at error severity in the root config', () => {
    const parsed = ts.readConfigFile(config, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const rules = parsed.config.rules as Record<string, string>
    expect(rules['node/no-path-concat']).toBe('error')
  })

  it('rejects separator concatenation and accepts path.join plus extension suffixes', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-node-path-concat-'))
    const bad = join(root, 'bad.cjs')
    const good = join(root, 'good.cjs')
    try {
      writeFileSync(
        bad,
        "const joined = __dirname + '/config.json'\nconst templated = `${__filename}/config.json`\nmodule.exports = { joined, templated }\n",
      )
      writeFileSync(
        good,
        "const { join } = require('node:path')\nconst joined = join(__dirname, 'config.json')\nconst mapped = __filename + '.map'\nmodule.exports = { joined, mapped }\n",
      )

      const result = spawnSync(oxlint, ['--config', config, '--format', 'json', bad, good], {
        encoding: 'utf8',
        timeout: remaining(),
        killSignal: 'SIGKILL',
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
      ).toEqual(['bad.cjs', 'bad.cjs'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
