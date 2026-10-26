import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Rule = {
  name: string
  rule: string
  scope: string
  severity: string
  options: {
    include: string[]
    exclude: string[]
    sqlInclude?: string[]
    bannedShapes?: string[]
    unanalyzableSql: string
  }
}

describe('SQL shape configuration', () => {
  it('enables pagination and query-shape rules for runtime code and schema SQL', async () => {
    const config = parse(
      await readFile(new URL('../../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const rules = config.rules.filter(rule =>
      ['postgres-no-offset', 'postgres-sql-shape-policy'].includes(rule.rule),
    )

    expect(
      rules.map(({ rule, scope, severity, options }) => ({
        rule,
        scope,
        severity,
        include: options.include,
        exclude: options.exclude,
        sqlInclude: options.sqlInclude,
        bannedShapes: options.bannedShapes,
        unanalyzableSql: options.unanalyzableSql,
      })),
    ).toEqual([
      {
        rule: 'postgres-no-offset',
        scope: 'repository',
        severity: 'error',
        include: ['backend/**/*.{ts,mts}'],
        exclude: ['**/*.test.*', '**/__tests__/**', '**/test-helpers/**', 'backend/scripts/**'],
        sqlInclude: [
          'backend/data-stores/psql/views/**/*.sql',
          'backend/data-stores/psql/migrations/**/*.sql',
          'backend/data-stores/psql/config-driven/**/*.sql',
        ],
        bannedShapes: undefined,
        unanalyzableSql: 'ignore',
      },
      {
        rule: 'postgres-sql-shape-policy',
        scope: 'repository',
        severity: 'error',
        include: [
          'backend/**/*.{ts,mts,js}',
          'backend/data-stores/psql/config-driven/**/*.sql',
          'backend/data-stores/psql/views/**/*.sql',
          'backend/data-stores/psql/migrations/**/*.sql',
        ],
        exclude: ['**/*.test.*', '**/__tests__/**', '**/test-helpers/**', 'backend/scripts/**'],
        sqlInclude: [
          'backend/data-stores/psql/config-driven/**/*.sql',
          'backend/data-stores/psql/views/**/*.sql',
          'backend/data-stores/psql/migrations/**/*.sql',
        ],
        bannedShapes: [
          'correlated-exists-set-operation',
          'not-in-subquery',
          'count-for-existence',
          'banned-function-call',
        ],
        unanalyzableSql: 'ignore',
      },
    ])
  })
})
