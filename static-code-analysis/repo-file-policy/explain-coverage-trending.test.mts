import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportCoverage } from '../explain-coverage.mts'

describe('assembled EXPLAIN reads', () => {
  it('keeps trending and batch access reads visible', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-trending-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const paths = [
        'backend/services/trending-posts/get-trending-posts.mts',
        'backend/services/trending-topics/get-trending-topics.mts',
        'backend/services/posts/check-privacy-access-batch.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report.reads).toBe(3)
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'getTrendingPosts',
        'getTrendingTopics',
        'canViewPostsBatch',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
