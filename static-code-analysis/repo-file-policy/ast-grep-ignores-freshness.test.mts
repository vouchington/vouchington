import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkAstGrepIgnoresFreshness } from './ast-grep-ignores-freshness.mts'

describe('ast-grep ignores freshness', () => {
  it('reports a missing literal and a glob that matches no tracked file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-ast-grep-ignores-'))
    try {
      const ruleFile = 'ast-grep-rules/sample.yml'
      await mkdir(dirname(join(dir, ruleFile)), { recursive: true })
      await writeFile(
        join(dir, ruleFile),
        [
          'id: sample',
          'ignores:',
          "  - 'missing/file.mts'",
          "  - 'kept/file.mts'",
          "  - 'src/**/*.test.mts'",
          "  - 'present/**/*.mts'",
          '',
        ].join('\n'),
      )
      const errors: string[] = []
      checkAstGrepIgnoresFreshness(dir, [ruleFile, 'kept/file.mts', 'present/a.mts'], errors)
      expect(errors).toEqual([
        'ast-grep-rules/sample.yml: stale ignores entry missing/file.mts; remove it',
        'ast-grep-rules/sample.yml: stale ignores entry src/**/*.test.mts; remove it',
      ])
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
