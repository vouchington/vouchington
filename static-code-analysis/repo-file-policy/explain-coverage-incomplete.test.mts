import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractExecutedPostgresSql } from 'no-mistakes'
import { describe, expect, it } from 'vitest'
import { buildCoverageReport } from '../explain-coverage.mts'

describe('EXPLAIN coverage for incomplete SQL', () => {
  it('keeps unique composed search reads ambiguous despite matching names', async () => {
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
    expect(report).toMatchObject({ reads: 2, coveredReads: 0 })
    expect(report.ambiguousReads.map(read => read.name)).toEqual(names)
  })
})
