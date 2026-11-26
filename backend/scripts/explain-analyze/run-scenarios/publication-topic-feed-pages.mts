import assert from 'node:assert/strict'
import { listTopicPublicationFeedsPage } from '@services/post-publication/topic-feed-pages'
import {
  postPublicationWorkConfig,
  postPublicationWorkMaxValues,
} from '@services/post-publication/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  publicationTopicFeedCount,
  publicationTopicFeedIds,
  seedPublicationTopicFeedPages,
  cleanupPublicationTopicFeedPages,
} from '../seed-data/publication-topic-feed-pages.mts'

export async function capturePublicationTopicFeedPages(): Promise<void> {
  const limit = postPublicationWorkMaxValues.capture_batch_size
  try {
    await cleanupPublicationTopicFeedPages()
    await seedPublicationTopicFeedPages()
    await postPublicationWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      capture_batch_size: limit,
    })
    try {
      await capturePage('publication-topic-feed-first-page', null, limit - 1)
      await capturePage(
        'publication-topic-feed-continuation',
        publicationTopicFeedIds[limit - 1]!,
        limit * 2 - 1,
      )
    } finally {
      restore()
    }
  } finally {
    await cleanupPublicationTopicFeedPages()
  }
}

async function capturePage(name: string, after: string | null, lastIndex: number): Promise<void> {
  const limit = postPublicationWorkMaxValues.capture_batch_size
  registerScenarioContract(name, {
    seededRows: { rss_feeds: publicationTopicFeedCount * 2 },
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_rss_feeds__topic_id__unique'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: limit + 1 },
    ],
  })
  await runAndCapture(name, async () => {
    const page = await listTopicPublicationFeedsPage(publicationTopicFeedIds, after)
    assert.equal(page.ids.length, limit)
    assert.equal(page.hasMore, true)
    assert.equal(page.cursor, publicationTopicFeedIds[lastIndex])
  })
}
