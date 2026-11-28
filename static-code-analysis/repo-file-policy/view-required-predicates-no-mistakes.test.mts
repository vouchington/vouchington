import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { resolveConfig } from 'no-mistakes'
import { describe, expect, it } from 'vitest'

type Rule = {
  rule: string
  scope: string
  severity: string
  options: {
    importSpecifier: string
    executorFactoryNames: string[]
    executorTypeNames: string[]
    include: string[]
    exclude: string[]
    unanalyzableSql: string
    relations?: { table: string; requireColumns: string[] }[]
  }
}
type ViewRule = Rule & {
  options: Rule['options'] & { relations: NonNullable<Rule['options']['relations']> }
}

describe('view lookup predicate configuration', () => {
  it('covers every non-materialized catalog view', async () => {
    // no-mistakes-disable-next-line forbidden-calls: asserts the live required-predicates rule covers every catalog view, a cross-file invariant a fixture config cannot exercise.
    const config = (await resolveConfig({
      root: fileURLToPath(new URL('../../', import.meta.url)),
      view: 'declared',
    })) as unknown as {
      rules: Rule[]
    }
    const catalog = JSON.parse(
      await readFile(
        new URL(
          '../../backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { views: Record<string, { materialized: boolean }> }
    const rule = config.rules.find(
      (candidate): candidate is ViewRule =>
        candidate.rule === 'postgres-required-predicates' &&
        (candidate.options.relations?.some(
          relation => relation.table === 'view_publicly_projected_image_placements',
        ) ??
          false),
    )
    if (!rule) throw new Error('view lookup predicate rule is missing')

    expect(rule.options.relations.map(relation => relation.table).toSorted()).toEqual(
      Object.entries(catalog.views)
        .filter(([name, view]) => name.startsWith('view_') && !view.materialized)
        .map(([name]) => name)
        .toSorted(),
    )
  })
})
