import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Rule = {
  name: string
  rule: string
  scope: string
  severity: string
  options: {
    schemaCatalogPath: string
    requirements: {
      column: string
      function: string
      timing: string
      events: string[]
      forEachRow: boolean
      allowColumnList: boolean
    }[]
    allow?: { object: string }[]
  }
}

describe('column trigger configuration', () => {
  it('keeps both updated_at rules enabled at error severity with the posts exception', async () => {
    const config = parse(
      await readFile(new URL('../../.no-mistakes.yml', import.meta.url), 'utf8'),
    ) as {
      rules: Rule[]
    }
    const rules = config.rules.filter(rule => rule.rule === 'postgres-column-requires-trigger')

    expect(
      rules.map(rule => ({
        rule: rule.rule,
        scope: rule.scope,
        severity: rule.severity,
        schemaCatalogPath: rule.options.schemaCatalogPath,
        requirements: rule.options.requirements,
        allow: rule.options.allow?.map(entry => entry.object),
      })),
    ).toEqual([
      {
        rule: 'postgres-column-requires-trigger',
        scope: 'repository',
        severity: 'error',
        schemaCatalogPath: 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json',
        requirements: [
          {
            column: 'updated_at',
            function: 'fn_update_updated_at',
            timing: 'before',
            events: ['update'],
            forEachRow: true,
            allowColumnList: false,
          },
        ],
        allow: ['table:posts'],
      },
      {
        rule: 'postgres-column-requires-trigger',
        scope: 'repository',
        severity: 'error',
        schemaCatalogPath: 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json',
        requirements: [
          {
            column: 'updated_at',
            function: 'fn_update_updated_at',
            timing: 'before',
            events: ['update'],
            forEachRow: true,
            allowColumnList: true,
          },
        ],
        allow: undefined,
      },
    ])
  })
})
