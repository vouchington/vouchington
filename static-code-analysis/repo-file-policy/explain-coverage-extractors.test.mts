import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportCoverage } from '../explain-coverage.mts'
describe('EXPLAIN extractor overlap', () => {
  it('counts overlapping extraction passes once while retaining subpath cursor and notification reads', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-extractors-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            {
              name: 'selectRssFeedItemNotificationRecipientBatch',
              query_text: '/* selectRssFeedItemNotificationRecipientBatch */ SELECT user_id',
              scenario_id: 'fixture',
            },
            {
              name: 'selectPostNotificationRecipientBatch',
              query_text: '/* selectPostNotificationRecipientBatch */ SELECT user_id',
              scenario_id: 'fixture',
            },
          ],
          completedScenarioIds: ['fixture'],
        }),
      )
      const paths = [
        'backend/services/notifications/reconcile-batches.mts',
        'backend/services/referral-program-link-validations/contains-referral-links.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report).toMatchObject({ annotatedStatements: 3, reads: 3, coveredReads: 0 })
      expect(report.ambiguousReads.map(read => read.name)).toEqual([
        'selectRssFeedItemNotificationRecipientBatch',
        'selectPostNotificationRecipientBatch',
      ])
      expect(report.uncoveredReads.map(read => read.name)).toEqual(['containsReferralLinks'])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('matches only the bounded cursor wrapper around the exact complete source SQL', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-bounded-cursor-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      const source = `import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'
createAsyncGeneratorFromCursor(sql\`/* boundedCursorRead */ SELECT id FROM posts;\`, { maxRows: 10 })
`
      const sources = [{ fileName: 'backend/services/posts/bounded.mts', source }]
      const capture = (inner: string) => {
        writeFileSync(
          resultsPath,
          JSON.stringify({
            results: [
              {
                name: 'boundedCursorRead',
                query_text: `/* boundedCursorRead */ SELECT * FROM (${inner}) bounded_cursor_rows LIMIT $1`,
                scenario_id: 'bounded',
              },
            ],
            completedScenarioIds: ['bounded'],
          }),
        )
      }
      capture('/* boundedCursorRead */ SELECT id FROM posts')
      expect(await reportCoverage(sources, resultsPath, ['bounded'])).toMatchObject({
        annotatedStatements: 1,
        reads: 1,
        coveredReads: 1,
        uncoveredReads: [],
      })
      capture('/* boundedCursorRead */ SELECT id FROM other_posts')
      expect(await reportCoverage(sources, resultsPath, ['bounded'])).toMatchObject({
        annotatedStatements: 1,
        reads: 1,
        coveredReads: 0,
        uncoveredReads: [expect.objectContaining({ name: 'boundedCursorRead' })],
      })
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
