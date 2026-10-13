import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportCoverage } from '../explain-coverage.mts'

describe('current EXPLAIN read inventory', () => {
  it('counts proven readers and excludes unresolved WITH fragments from production sources', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-current-reads-'))
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
        'backend/services/topics/get-batch.mts',
        'backend/services/urls-hostnames/get-batch.mts',
        'backend/services/users/get-public-batch.mts',
        'backend/services/crawls/get-html-by-url-ids.mts',
        'backend/services/bedrock-embeddings-batch/orchestrator/results.mts',
        'backend/services/users/get.mts',
        'backend/services/rss-feeds/reconcile-item-language.mts',
        'backend/services/stories/get-post-stories.mts',
        'backend/services/urls/get.mts',
        'backend/services/entity-cache/keys.mts',
        'backend/services/hostname-blocking/soft-delete-relations.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      const names = report.uncoveredReads.map(read => read.name)
      for (const name of [
        'getLatestHtmlByUrlIds',
        'downloadBatchResults',
        'reenqueueItemLanguageDetectionIfNeeded',
        'getPostStoryIdsByStoryIds',
        'getPostStoryByPostId',
        'getUrlById',
        'getPostCacheKeys',
      ]) {
        expect(names.filter(candidate => candidate === name)).toHaveLength(1)
      }
      for (const name of [
        'getTopicsByAnyBatch',
        'getUrlHostnamesByAnyBatch',
        'getPublicUsersByAnyBatch',
        'getPublicUserByAny',
        'getPrivateUserByAny',
        'blockHostname_softDeleteRelations',
      ])
        expect(names).not.toContain(name)
      expect(report.annotatedStatements).toBeGreaterThan(report.reads)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
