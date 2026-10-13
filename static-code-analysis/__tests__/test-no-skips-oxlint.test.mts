import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const OXLINT = resolve('node_modules/.bin/oxlint')
const CONFIG = resolve('.oxlintrc.json')
const RULE = 'no-mistakes(test-no-skips)'

const fixtures = {
  'skip.test.mts': {
    rejected: true,
    source: "import { it } from 'vitest'\nit.skip('network', () => {})\n",
  },
  'skip-if.test.mts': {
    rejected: true,
    source:
      "import { describe } from 'vitest'\ndescribe.skipIf(!process.env.KEY)('credential', () => {})\n",
  },
  'context-skip.test.mts': {
    rejected: true,
    source: "import { it } from 'vitest'\nit('missing', ctx => {\n  ctx.skip()\n})\n",
  },
  'playwright-fixme.test.mts': {
    rejected: true,
    source: "import { test } from '@playwright/test'\ntest.fixme('known issue', async () => {})\n",
  },
  'runs.test.mts': {
    rejected: false,
    source: "import { expect, it } from 'vitest'\nit('runs', () => {\n  expect(1).toBe(1)\n})\n",
  },
  'data-field.test.mts': {
    rejected: false,
    source:
      "import { expect, it } from 'vitest'\nconst options = { skipIfDeleted: true }\nit('runs', () => {\n  expect(options.skipIfDeleted).toBe(true)\n})\n",
  },
} as const

describe('no-mistakes/test-no-skips Oxlint policy', () => {
  it('enables the rule at error severity in the root config', () => {
    const parsed = ts.readConfigFile(CONFIG, ts.sys.readFile)
    expect(parsed.error).toBeUndefined()
    const rules = parsed.config.rules as Record<string, string>
    expect(rules['no-mistakes/test-no-skips']).toBe('error')
  })

  it('rejects skipped and focused tests and accepts ordinary tests', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-test-no-skips-'))
    try {
      for (const [file, fixture] of Object.entries(fixtures)) {
        writeFileSync(join(root, file), fixture.source)
      }

      const result = spawnSync(OXLINT, ['-c', CONFIG, '--format', 'json', '.'], {
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
          .map(({ filename }) => filename.replace(`${root}/`, ''))
          .toSorted(),
      ).toEqual(
        Object.entries(fixtures)
          .filter(([, fixture]) => fixture.rejected)
          .map(([file]) => file)
          .toSorted(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
