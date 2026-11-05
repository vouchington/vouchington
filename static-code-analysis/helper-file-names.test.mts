import { fileURLToPath } from 'node:url'

import { resolveConfig } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

type Rule = {
  rule?: string
  scope?: string
  severity?: string
  options?: { bannedPaths?: { glob: string; message: string }[] }
}

describe('helper file basename configuration', () => {
  it('keeps the helper basename ban enabled at error severity', async () => {
    const config = (await resolveConfig({
      root: fileURLToPath(new URL('..', import.meta.url)),
      view: 'declared',
    })) as unknown as {
      rules: Rule[]
    }
    const rule = config.rules.find(
      candidateRule =>
        candidateRule.rule === 'banned-paths' &&
        candidateRule.options?.bannedPaths?.some(entry => entry.glob === '**/*test-helpers*'),
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
