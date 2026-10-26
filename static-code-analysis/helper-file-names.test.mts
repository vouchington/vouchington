import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Rule = {
  rule?: string
  scope?: string
  severity?: string
  options?: { bannedPaths?: { glob: string; message: string }[] }
}

describe('helper file basename configuration', () => {
  it('keeps the helper basename ban enabled at error severity', async () => {
    const config = parse(
      await readFile(new URL('../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const rule = config.rules.find(
      rule =>
        rule.rule === 'banned-paths' &&
        rule.options?.bannedPaths?.some(entry => entry.glob === '**/*test-helpers*'),
    )
    const guard = rule?.options?.bannedPaths?.find(entry => entry.glob === '**/*test-helpers*')

    expect(rule).toMatchObject({
      rule: 'banned-paths',
      scope: 'repository',
      severity: 'error',
    })
    expect(guard).toEqual({
      glob: '**/*test-helpers*',
      message:
        'File basenames must not contain test-helpers; use a descriptive name under an allowed helper directory.',
    })
  })
})
