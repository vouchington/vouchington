import { fileURLToPath } from 'node:url'

import { resolveConfig } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

type Rule = {
  name: string
  rule: string
  scope: string
  severity: string
  options: {
    configPath: string
    appRoot: string
    includeRewrites: boolean
    trackedRoutesOnly: boolean
  }
}

describe('redirect destination configuration', () => {
  it('enables tracked App Router destination checks at error severity', async () => {
    const config = (await resolveConfig({
      root: fileURLToPath(new URL('../../', import.meta.url)),
      view: 'declared',
    })) as unknown as {
      rules: Rule[]
    }
    const rules = config.rules.filter(rule => rule.rule === 'nextjs-redirect-destinations')

    expect(
      rules.map(({ rule, scope, severity, options }) => ({
        rule,
        scope,
        severity,
        options,
      })),
    ).toEqual([
      {
        rule: 'nextjs-redirect-destinations',
        scope: 'repository',
        severity: 'error',
        options: {
          configPath: 'web/next.config.ts',
          appRoot: 'web/app',
          includeRewrites: false,
          trackedRoutesOnly: true,
        },
      },
    ])
  })
})
