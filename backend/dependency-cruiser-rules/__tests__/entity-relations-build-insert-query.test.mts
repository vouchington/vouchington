import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

import { cruise, type ICruiseResult, type IForbiddenRuleType } from 'dependency-cruiser'
import { describe, expect, it } from 'vitest'
import './fixtures/build-insert-query/aliased-import.mts'
import './fixtures/build-insert-query/direct-import.mts'
import './fixtures/build-insert-query/transitive-consumer.cts'
import './fixtures/build-insert-query/unrelated-local.mts'

const require = createRequire(import.meta.url)
const { noBuildInsertQueryOutsideEntityRelations } =
  require('../entity-relations-build-insert-query.cjs') as {
    noBuildInsertQueryOutsideEntityRelations: IForbiddenRuleType
  }

const fixtureRoot = 'backend/dependency-cruiser-rules/__tests__/fixtures/build-insert-query'

async function violationsFor(...entrypoints: string[]) {
  const result = await cruise(entrypoints, {
    moduleSystems: ['es6', 'cjs'],
    ruleSet: { forbidden: [noBuildInsertQueryOutsideEntityRelations] },
    tsConfig: { fileName: 'backend/tsconfig.json' },
    tsPreCompilationDeps: true,
    validate: true,
  })
  const cruiseResult = result.output as ICruiseResult
  return cruiseResult.summary.violations.map(({ from, rule, to }) => ({
    from,
    rule: rule.name,
    to,
  }))
}

describe('no-build-insert-query-outside-entity-relations', () => {
  it.each(['direct-import.mts', 'aliased-import.mts'])(
    'rejects the prohibited module edge in %s independent of local identifier spelling',
    async fixture => {
      const violations = await violationsFor(`${fixtureRoot}/${fixture}`)

      expect(violations).toEqual([
        expect.objectContaining({
          from: expect.stringContaining(fixture),
          rule: 'no-build-insert-query-outside-entity-relations',
          to: 'backend/services/entity-relations/build-insert-query.mts',
        }),
      ])
    },
  )

  it('rejects a prohibited re-export reached through an intermediate module', async () => {
    const violations = await violationsFor(`${fixtureRoot}/transitive-consumer.cts`)

    expect(violations).toEqual([
      expect.objectContaining({
        from: expect.stringContaining('re-export.cts'),
        rule: 'no-build-insert-query-outside-entity-relations',
        to: 'backend/services/entity-relations/build-insert-query.mts',
      }),
    ])
  })

  it('allows imports owned by entity-relations', async () => {
    await expect(violationsFor('backend/services/entity-relations/upsert.mts')).resolves.toEqual([])
  })

  it('does not flag an unrelated local helper with the same name', async () => {
    await expect(violationsFor(`${fixtureRoot}/unrelated-local.mts`)).resolves.toEqual([])
  })

  it('has no context-free AST-grep duplicate', () => {
    expect(existsSync('ast-grep-rules/no-build-insert-query-outside-entity-relations.yml')).toBe(
      false,
    )
  })
})
