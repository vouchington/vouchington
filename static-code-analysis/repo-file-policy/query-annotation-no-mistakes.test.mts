import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Rule = {
  name: string
  rule: string
  scope: string
  severity: string
  options: {
    effort: string
    unanalyzableSql: string
    include: string[]
    exclude?: string[]
  }
}

describe('query annotation configuration', () => {
  it('keeps runtime and development-helper scopes enabled at error severity', async () => {
    const config = parse(
      await readFile(new URL('../../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const rules = config.rules.filter(rule => rule.rule === 'postgres-require-query-annotation')

    expect(
      rules.map(({ rule, scope, severity, options }) => ({
        rule,
        scope,
        severity,
        effort: options.effort,
        unanalyzableSql: options.unanalyzableSql,
        include: options.include,
        exclude: options.exclude,
      })),
    ).toEqual([
      {
        rule: 'postgres-require-query-annotation',
        scope: 'repository',
        severity: 'error',
        effort: 'low',
        unanalyzableSql: 'advise',
        include: ['backend/**/*.{ts,mts}'],
        exclude: [
          '**/*.test.*',
          '**/__tests__/**',
          '**/test-helpers/**',
          'backend/scripts/seeds/**',
          'backend/data-stores/psql/migration-runner/**',
        ],
      },
      {
        rule: 'postgres-require-query-annotation',
        scope: 'repository',
        severity: 'error',
        effort: 'low',
        unanalyzableSql: 'advise',
        include: [
          'backend/test-helpers/entities/create-test-entities.mts',
          'backend/test-helpers/entities/rss-feeds.mts',
          'backend/test-helpers/entities/topics/core.mts',
          'backend/test-helpers/entities/urls.mts',
          'backend/test-helpers/entities/users-direct.mts',
        ],
        exclude: undefined,
      },
    ])
  })
})
