import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractExecutedPostgresSql } from 'no-mistakes'
import { describe, expect, it } from 'vitest'
import { buildCoverageReport, formatCoverageReport, reportCoverage } from '../explain-coverage.mts'

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
    const captures = names.map(name => ({
      name,
      query_text: `/* ${name} */ SELECT 1`,
      scenario_id: 'fixture',
    }))
    const report = buildCoverageReport(facts, captures)
    expect(report).toMatchObject({ reads: 0, coveredReads: 0 })
    expect(report.unclassifiedStatements).toEqual(
      sources.map(({ fileName }) =>
        expect.objectContaining({
          fileName,
          name: '(annotation unavailable)',
          reason: expect.any(String),
        }),
      ),
    )
    expect(report.unclassifiedStatements.every(statement => statement.reason.length > 0)).toBe(true)
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

  it('keeps unresolved imported builder calls visible without inventing an annotation', async () => {
    const facts = await extractExecutedPostgresSql({
      sources: [
        {
          fileName: 'src/build-items.ts',
          source:
            "import sql from 'sql-template-strings'; export async function buildItemsQuery(options) { const query = sql`/* listItems */ SELECT id FROM items`; if (options.after) query.append(sql` WHERE id > ${options.after}`); return query }",
        },
        {
          fileName: 'src/list-items.ts',
          source:
            "import { read } from 'db'; import { buildItemsQuery } from './build-items.js'; export async function listItems(options) { const query = await buildItemsQuery(options); return read(query) }",
        },
      ],
      importSpecifier: 'db',
      executorNames: ['read'],
      resolveImports: true,
    })
    const report = buildCoverageReport(facts, [])
    expect(report).toMatchObject({ annotatedStatements: 0, reads: 0, coveredReads: 0 })
    expect(report.unclassifiedStatements).toEqual([
      expect.objectContaining({
        name: '(annotation unavailable)',
        fileName: 'src/list-items.ts',
        reason: 'opaque-member-or-getter',
      }),
    ])
  })

  it('keeps raw session-local PoolClient reads visible as uncovered', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-pool-client-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const fileName = 'backend/services/notifications/reconcile-batches.mts'
      const source = readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8')
      const report = await reportCoverage([{ fileName, source }], resultsPath, ['fixture'])
      expect(report).toMatchObject({ annotatedStatements: 2, reads: 2, coveredReads: 0 })
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'selectRssFeedItemNotificationRecipientBatch',
        'selectPostNotificationRecipientBatch',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('includes internal PostgreSQL executor imports', async () => {
    const paths = ['backend/data-stores/psql/upsert-user-agent-string.mts']
    const sources = paths.map(fileName => ({
      fileName,
      source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
    }))
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-internal-executors-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'upsertUserAgentString',
        'upsertUserAgentString',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
