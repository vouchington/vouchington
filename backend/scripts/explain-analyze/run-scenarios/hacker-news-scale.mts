import type { ExplainResult } from '@vouchington/explain-plan'
import { read } from '@data-stores/psql'
import { postsWorkConfig } from '@services/posts/work-limits'
import { prepareOutputDir } from '../run-support.mts'
import {
  HACKER_NEWS_SCALE_CACHE_STATES,
  HACKER_NEWS_SCALE_SHAPES,
  HACKER_NEWS_SCALE_SORTS,
  HACKER_NEWS_SCALE_WINDOWS,
} from '../hacker-news-scale-scenario-ids.mts'
import {
  seedHackerNewsScaleFixture,
  type HackerNewsScaleFixture,
} from '../seed-data/hacker-news-scale-fixture.mts'
import {
  analyzeHackerNewsScaleFixture,
  setHackerNewsScaleShape,
  verifyHackerNewsScaleShape,
} from '../seed-data/hacker-news-scale-shapes.mts'
import { disableHackerNewsScaleReferenceAutovacuum } from '../seed-data/hacker-news-scale-storage.mts'
import { prepareHackerNewsReadCache } from './hacker-news-scale-cache.mts'
import { hackerNewsScalePages } from './hacker-news-scale-pages.mts'
import {
  captureHackerNewsScalePage,
  captureHackerNewsScaleReference,
  captureHackerNewsUnvotedSidecar,
} from './hacker-news-scale-captures.mts'
import { writeHackerNewsScaleReport } from './hacker-news-scale-report.mts'

/** Last corpus phase: its future leaves must not change any ordinary scenario's plans. */
export async function runHackerNewsScaleScenarios(): Promise<void> {
  await prepareHackerNewsReadCache()
  await disableHackerNewsScaleReferenceAutovacuum()
  const fixture = await seedHackerNewsScaleFixture()
  await measureHackerNewsScaleFixture(fixture)
}

/** An existing owned fixture may be replayed directly without rerunning ordinary scenarios. */
export async function measureHackerNewsScaleFixture(
  fixture: HackerNewsScaleFixture,
): Promise<void> {
  await prepareHackerNewsReadCache()
  await disableHackerNewsScaleReferenceAutovacuum()
  await postsWorkConfig.waitForInitialization()
  prepareOutputDir()
  const observations: unknown[] = []
  const referencePlans: ExplainResult[] = []
  const { rows } = await read<{ posts: number; urls: number; relations: number }>(
    `/* hackerNewsScaleCorpusCounts */ SELECT
      (SELECT count(*)::int FROM posts) AS posts,
      (SELECT count(*)::int FROM urls) AS urls,
      (SELECT count(*)::int FROM relation__post__related__url) AS relations`,
  )
  const counts = rows[0]
  if (!counts) throw new Error('HN scale corpus counts are missing')
  const context = {
    fixture,
    observations,
    referencePlans,
    seededRows: {
      posts: counts.posts,
      urls: counts.urls,
      relation__post__related__url: counts.relations + 3000,
      url_hacker_news_totals: fixture.urlIds.length,
    },
  }
  try {
    for (const shape of HACKER_NEWS_SCALE_SHAPES) {
      await setHackerNewsScaleShape(fixture, shape)
      const statistics = await analyzeHackerNewsScaleFixture(fixture)
      const truth = await verifyHackerNewsScaleShape(fixture, shape)
      observations.push({ shape, statistics, truth })
      for (const sort of HACKER_NEWS_SCALE_SORTS) {
        for (const window of HACKER_NEWS_SCALE_WINDOWS) {
          const prefix = `hacker-news-scale-${shape}-${sort}-${window}`
          const pages = await hackerNewsScalePages(fixture, shape, sort, window)
          for (const page of pages) {
            observations.push({ scenario: `${prefix}-${page.name}`, expectedIds: page.expectedIds })
            for (const cache of HACKER_NEWS_SCALE_CACHE_STATES) {
              await captureHackerNewsScalePage(context, prefix, page, cache)
            }
            await captureHackerNewsScaleReference(context, prefix, page)
          }
        }
      }
      if (shape === 'related') {
        for (const cache of HACKER_NEWS_SCALE_CACHE_STATES) {
          await captureHackerNewsUnvotedSidecar(context, cache)
        }
      }
    }
  } finally {
    writeHackerNewsScaleReport(fixture, observations, referencePlans)
  }
}
