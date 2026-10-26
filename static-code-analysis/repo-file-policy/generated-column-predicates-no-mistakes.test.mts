import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const helperFiles = [
  'backend/test-helpers/entities/create-test-entities.mts',
  'backend/test-helpers/entities/rss-feeds.mts',
  'backend/test-helpers/entities/topics/core.mts',
  'backend/test-helpers/entities/urls.mts',
  'backend/test-helpers/entities/users-direct.mts',
]

type Rule = {
  name: string
  rule: string
  scope: string
  severity: string
  options: {
    importSpecifier: string
    executorFactoryNames: string[]
    include: string[]
    exclude?: string[]
    sqlInclude: string[]
    functions: string[]
    requireArgumentIsPrimaryKey: boolean
    clauses: string[]
    extraGeneratedColumns: { table: string; column: string; sourceColumn: string }[]
    unanalyzableSql: string
  }
}

describe('generated-column predicate configuration', () => {
  it('keeps production and helper scopes enabled with the same generated-column options', async () => {
    const config = parse(
      await readFile(new URL('../../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const rules = config.rules.filter(rule => rule.rule === 'postgres-generated-column-predicates')
    const [production, developmentHelpers] = rules

    expect(
      rules.map(rule => ({ rule: rule.rule, scope: rule.scope, severity: rule.severity })),
    ).toEqual([
      {
        rule: 'postgres-generated-column-predicates',
        scope: 'repository',
        severity: 'error',
      },
      {
        rule: 'postgres-generated-column-predicates',
        scope: 'repository',
        severity: 'error',
      },
    ])
    expect(production?.options).toMatchObject({
      importSpecifier: '@data-stores/psql',
      executorFactoryNames: ['beginTransaction', 'beginBoundedTransaction'],
      include: ['backend/**/*.{ts,mts}'],
      exclude: [
        '**/*.test.*',
        '**/__tests__/**',
        '**/test-helpers/**',
        'backend/scripts/seeds/**',
        'backend/data-stores/psql/migration-runner/**',
      ],
      sqlInclude: [
        'backend/data-stores/psql/migrations/**/*.sql',
        'backend/data-stores/psql/views/**/*.sql',
        'backend/data-stores/psql/config-driven/**/*.sql',
      ],
      functions: ['uuid_extract_timestamp'],
      requireArgumentIsPrimaryKey: false,
      clauses: ['where', 'join', 'order-by'],
      unanalyzableSql: 'ignore',
    })
    expect(developmentHelpers?.options).toMatchObject({
      include: helperFiles,
      sqlInclude: production?.options.sqlInclude,
      functions: production?.options.functions,
      requireArgumentIsPrimaryKey: false,
      clauses: production?.options.clauses,
      unanalyzableSql: 'ignore',
    })
    expect(developmentHelpers?.options.extraGeneratedColumns).toEqual(
      production?.options.extraGeneratedColumns,
    )
    expect(production?.options.extraGeneratedColumns).toContainEqual({
      table: 'user_vouch_votes',
      column: 'created_at',
      sourceColumn: 'id',
    })
  })
})
