import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Rule = {
  name: string
  rule: string
  scope: string
  severity: string
  options: {
    safeDirective?: string
    schemaCatalogPath?: string
    include?: string[]
    exclude?: string[]
    sqlInclude?: string[]
    unanalyzableSql?: string
    extraGeneratedColumns?: unknown[]
    triggerMaintainedColumns?: string[]
  }
}

describe('opaque SQL policy configuration', () => {
  it('keeps lock and generated-column SQL rules enabled at error severity', async () => {
    const config = parse(
      await readFile(new URL('../../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const opaqueRules = config.rules.filter(rule =>
      ['postgres-lock-ordering', 'postgres-no-generated-column-writes'].includes(rule.rule),
    )

    expect(
      opaqueRules.map(({ rule, scope, severity, options }) => ({
        rule,
        scope,
        severity,
        unanalyzableSql: options.unanalyzableSql,
      })),
    ).toEqual([
      {
        rule: 'postgres-lock-ordering',
        scope: 'repository',
        severity: 'error',
        unanalyzableSql: 'ignore',
      },
      {
        rule: 'postgres-lock-ordering',
        scope: 'repository',
        severity: 'error',
        unanalyzableSql: 'ignore',
      },
      {
        rule: 'postgres-no-generated-column-writes',
        scope: 'repository',
        severity: 'error',
        unanalyzableSql: 'ignore',
      },
      {
        rule: 'postgres-no-generated-column-writes',
        scope: 'repository',
        severity: 'error',
        unanalyzableSql: 'ignore',
      },
    ])
    expect(opaqueRules[0]?.options).toMatchObject({ safeDirective: 'deadlock-safe' })
    expect(opaqueRules[1]?.options).toMatchObject({
      schemaCatalogPath: 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json',
      safeDirective: 'deadlock-safe',
    })
    expect(opaqueRules[2]?.options).toMatchObject({
      sqlInclude: ['backend/data-stores/psql/migrations/**/*.sql'],
      extraGeneratedColumns: expect.arrayContaining([
        { table: 'agent_moderation_votes', column: 'created_at' },
      ]),
    })
    expect(opaqueRules[3]).toMatchObject({
      exclude: ['**/test-helpers/**'],
      options: { triggerMaintainedColumns: ['updated_at'] },
    })
  })
})
