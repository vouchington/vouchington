import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractExecutedPostgresSql } from 'no-mistakes'
import { describe, expect, it } from 'vitest'
import { buildCoverageReport, formatCoverageReport } from '../explain-coverage.mts'

describe('EXPLAIN coverage for incomplete SQL', () => {
  it('keeps incomplete composed search SQL unclassified despite matching names', async () => {
    const names = ['searchUrls', 'getPostIdsByUrlIds']
    const sources = [
      'backend/services/urls/search.mts',
      'backend/services/posts/search/get-posts-by-url-ids.mts',
    ].map(fileName => ({
      fileName,
      source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
    }))
    const facts = await extractExecutedPostgresSql({
      sources,
      importSpecifier: '@data-stores/psql',
      executorNames: ['query', 'read', 'write'],
      executorFactoryNames: ['beginTransaction', 'beginBoundedTransaction'],
      executorTypeNames: ['TransactionQuery', 'QueryExecutor', 'OwnedTransaction'],
    })
    expect(facts.map(fact => [fact.annotation, fact.kind, fact.complete])).toEqual([
      ['searchUrls', 'composed', false],
      ['getPostIdsByUrlIds', 'composed', false],
    ])
    const captures = facts.map(fact => ({
      name: fact.annotation!,
      query_text: fact.sqlText!,
      scenario_id: 'fixture',
    }))
    const report = buildCoverageReport(facts, captures)
    expect(report).toMatchObject({ reads: 0, coveredReads: 0 })
    expect(
      report.unclassifiedStatements.map(statement => [statement.name, statement.reason]),
    ).toEqual(names.map(name => [name, 'unresolved-sql-fragment']))
    expect(report.ambiguousReads).toEqual([])
  })

  it('reports an incomplete write without counting it as a read', async () => {
    const facts = await extractExecutedPostgresSql({
      sources: [
        {
          fileName: 'backend/services/things/update.mts',
          source:
            "import { write } from '@data-stores/psql'; write(`/* updateThing */ UPDATE things SET ${assignment}`)",
        },
      ],
      importSpecifier: '@data-stores/psql',
      executorNames: ['write'],
    })
    const report = buildCoverageReport(facts, [])
    expect(report).toMatchObject({ annotatedStatements: 1, reads: 0, coveredReads: 0 })
    expect(report.unclassifiedStatements).toContainEqual(
      expect.objectContaining({ name: 'updateThing', reason: 'unresolved-sql-fragment' }),
    )
    expect(formatCoverageReport(report)).toContain(
      'updateThing — backend/services/things/update.mts:1 — unresolved-sql-fragment',
    )
  })
})
