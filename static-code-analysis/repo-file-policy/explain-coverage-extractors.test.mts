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
      expect(report).toMatchObject({ annotatedStatements: 7, reads: 4, coveredReads: 2 })
      expect(report.ambiguousReads).toEqual([])
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'selectCreatedNotificationBatch',
        'containsReferralLinks',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
