import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  createTestTopic,
  createRandomString,
  WEB_PROVENANCE,
  getLatestTestRssFeedStateChange,
  getRssFeedDeletedAt,
} from '@voucha/test-helpers'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import {
  readTestRssFeedDeleteMarker,
  deleteTestRssFeedRow,
  insertCompletedTestAdminImportBatch,
  deleteTestAdminImportBatch,
  insertCompletedTestAdminImportRow,
  countTestFeedRows,
  markReferencedTestRssFeedForDeletion,
  insertTestFeedCrawl,
} from '../../test-helpers/rss-hard-delete-queries.mts'
import { createRssFeed } from './create.mts'
import { hardDeleteRssFeedById } from './delete.mts'
import { hardDeleteRssFeedChildPage } from './hard-delete-child-page.mts'
import { finalizeHardDeleteRssFeed } from './hard-delete-finalize.mts'

describe('RSS hard-delete terminal settlement', () => {
  it('parks a marked feed with retained admin import history and recovery converges', async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ hostname: `park-${createRandomString(10)}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://${topic.id}.example.com/park.xml`,
      topic_id: topic.id,
      title: 'Retained feed',
    })
    const batchId = await insertCompletedTestAdminImportBatch(user.id)
    onTestFinished(async () => {
      await deleteTestAdminImportBatch(batchId)
      await deleteTestRssFeedRow(feed.id)
    })
    await insertCompletedTestAdminImportRow(batchId, feed.id)
    await markReferencedTestRssFeedForDeletion(feed.id)
    // Earlier phases may already have drained the old setting history.
    await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')
    expect(await finalizeHardDeleteRssFeed(feed.id)).toEqual({
      deleted: false,
      remaining: 'admin_import_history',
    })
    expect(await readTestRssFeedDeleteMarker(feed.id)).toBeNull()
    expect(await getRssFeedDeletedAt(feed.id)).not.toBeNull()
    expect(await countTestFeedRows(feed.id)).toBe(1)
    expect(await getLatestTestRssFeedStateChange('enablement', feed.id)).toMatchObject({
      is_enabled: false,
      reason: 'Hard delete stopped: retained admin import history',
    })
    expect(await finalizeHardDeleteRssFeed(feed.id)).toEqual({ deleted: false, remaining: null })
    await expect(hardDeleteRssFeedById(feed.id)).rejects.toMatchObject({ status: 409 })
  })
  it('drains crawl and setting pages without publication effects', async () => {
    const topic = await createTestTopic({
      hostname: `no-effects-${createRandomString(10)}.example.com`,
    })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://${topic.id}.example.com/no-effects.xml`,
      topic_id: topic.id,
      title: 'Cleanup only',
    })
    onTestFinished(() => deleteTestRssFeedRow(feed.id))
    await insertTestFeedCrawl(feed.id)
    expect(
      await captureAddedPublicationEffectsForScope(feed.id, () => hardDeleteRssFeedById(feed.id)),
    ).toEqual([])
    expect(
      await captureAddedPublicationEffectsForScope(feed.id, () =>
        hardDeleteRssFeedChildPage(feed.id, 'setting_changes'),
      ),
    ).toEqual([])
    expect(
      await captureAddedPublicationEffectsForScope(feed.id, () =>
        hardDeleteRssFeedChildPage(feed.id, 'crawls'),
      ),
    ).toEqual([])
    const jobs = await captureAddedPublicationEffectsForScope(feed.id, () =>
      finalizeHardDeleteRssFeed(feed.id),
    )
    expect(jobs.flatMap(job => job.keys)).toEqual([
      { kind: 'identity_rss_feed', uuidValue: feed.id },
      { kind: 'impact_topic', uuidValue: topic.id },
    ])
    expect(
      await captureAddedPublicationEffectsForScope(feed.id, () =>
        finalizeHardDeleteRssFeed(feed.id),
      ),
    ).toEqual([])
  })
})
