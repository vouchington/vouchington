import { describe, expect, it, onTestFinished } from 'vitest'
import {
  readTestRssFeedDeleteMarker,
  deleteTestRssFeedRow,
  readTestFirstFeedSettingChange,
  deleteTestFeedSettingChange,
  updateTestFeedSettingChangeReason,
  readTestFirstPostClearanceChange,
  deleteTestPostClearanceChange,
  insertTestFeedCrawl,
  insertThreeTestFeedCrawls,
  insertCompletedTestUserImportBatch,
  deleteTestUserImportBatch,
  insertCompletedTestUserImportRow,
  insertCompletedTestAdminImportBatch,
  deleteTestAdminImportBatch,
  insertCompletedTestAdminImportRow,
  countTestFeedRows,
} from '../../test-helpers/rss-hard-delete-queries.mts'
import {
  createRandomString,
  createTestPost,
  createTestTopic,
  createTestUser,
  overrideDynamicConfigFieldsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { postPublicationWorkConfig } from '@services/post-publication/work-limits'
import { getRssFeedImport } from '../user-import-export/rss-feed-import-status.mts'
import { createRssFeed } from './create.mts'
import { hardDeleteRssFeedById } from './delete.mts'
import { hardDeleteRssFeedChildPage } from './hard-delete-child-page.mts'
import { finalizeHardDeleteRssFeed } from './hard-delete-finalize.mts'

describe('resumable RSS feed child removal', () => {
  it('allows only marked feed history deletion while other ledger mutations stay rejected', async () => {
    const nonce = createRandomString(10)
    const user = await createTestUser()
    const topic = await createTestTopic({ hostname: `rss-history-${nonce}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-history-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Guarded feed history',
    })
    onTestFinished(() => deleteTestRssFeedRow(feed.id))
    const changeId = await readTestFirstFeedSettingChange(feed.id)
    if (!changeId) throw new Error('Expected feed setting history')
    await expect(deleteTestFeedSettingChange(changeId)).rejects.toMatchObject({ code: '23514' })

    const post = await createTestPost({ user })
    const clearanceId = await readTestFirstPostClearanceChange(post.id)
    if (!clearanceId) throw new Error('Expected unrelated append-only history')
    await expect(deleteTestPostClearanceChange(clearanceId)).rejects.toMatchObject({
      code: '23514',
    })

    await hardDeleteRssFeedById(feed.id)
    await expect(updateTestFeedSettingChangeReason(changeId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(deleteTestFeedSettingChange(changeId)).resolves.toBe(1)
  })

  it('rejects a new crawl after the delete marker commits', async () => {
    const nonce = createRandomString(10)
    const topic = await createTestTopic({ hostname: `rss-delete-fence-${nonce}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-delete-fence-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Pending feed fence',
    })
    onTestFinished(() => deleteTestRssFeedRow(feed.id))
    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)
    await expect(insertTestFeedCrawl(feed.id)).rejects.toMatchObject({ code: '23514' })
  })

  it('keeps a completed user import outcome when its deleted feed link is cleared', async () => {
    const nonce = createRandomString(10)
    const user = await createTestUser()
    const topic = await createTestTopic({ hostname: `rss-import-result-${nonce}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-import-result-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Completed user import feed',
    })
    const batchId = await insertCompletedTestUserImportBatch(user.id)
    onTestFinished(async () => {
      await deleteTestUserImportBatch(batchId)
      await deleteTestRssFeedRow(feed.id)
    })
    await insertCompletedTestUserImportRow(
      batchId,
      `https://rss-import-result-${nonce}.example.com/feed.xml`,
      feed.id,
    )

    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)
    await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')
    await expect(hardDeleteRssFeedChildPage(feed.id, 'user_import_rows')).resolves.toMatchObject({
      removed: 1,
    })
    await expect(finalizeHardDeleteRssFeed(feed.id)).resolves.toMatchObject({ deleted: true })
    const result = await getRssFeedImport(user.id, batchId)
    expect(result?.rows).toMatchObject([{ status: 'imported' }])
    expect(result?.rows[0]).not.toHaveProperty('entity_id')
  })

  it('rejects retained admin import history before marking the feed for deletion', async () => {
    const nonce = createRandomString(10)
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ hostname: `rss-import-retained-${nonce}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-import-retained-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Retained import feed',
    })
    const batchId = await insertCompletedTestAdminImportBatch(user.id)
    onTestFinished(async () => {
      await deleteTestAdminImportBatch(batchId)
      await deleteTestRssFeedRow(feed.id)
    })
    await insertCompletedTestAdminImportRow(batchId, feed.id)
    await expect(hardDeleteRssFeedById(feed.id)).rejects.toMatchObject({ status: 409 })
    expect(await readTestRssFeedDeleteMarker(feed.id)).toBeNull()
  })

  it('drains crawl history in bounded committed pages before parent deletion', async () => {
    const restore = overrideDynamicConfigFieldsForTest(postPublicationWorkConfig, {
      rss_feed_hard_delete_capture_batch_size: 2,
    })
    onTestFinished(restore)
    const nonce = createRandomString(10)
    const topic = await createTestTopic({ hostname: `rss-delete-child-${nonce}.example.com` })
    const feed = await createRssFeed({
      provenance: WEB_PROVENANCE,
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-delete-child-${nonce}.example.com/feed.xml`,
      topic_id: topic.id,
      title: 'Bounded child deletion',
    })
    onTestFinished(() => deleteTestRssFeedRow(feed.id))
    await insertThreeTestFeedCrawls(feed.id)
    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)

    await expect(finalizeHardDeleteRssFeed(feed.id)).resolves.toMatchObject({
      deleted: false,
      remaining: 'setting_changes',
    })
    const settingPage = await hardDeleteRssFeedChildPage(feed.id, 'setting_changes')
    expect(settingPage).toEqual({ removed: 2, hasMore: true })
    await expect(hardDeleteRssFeedChildPage(feed.id, 'setting_changes')).resolves.toEqual({
      removed: 0,
      hasMore: false,
    })
    await expect(finalizeHardDeleteRssFeed(feed.id)).resolves.toMatchObject({
      deleted: false,
      remaining: 'crawls',
    })
    await expect(hardDeleteRssFeedChildPage(feed.id, 'crawls')).resolves.toMatchObject({
      removed: 2,
      hasMore: true,
    })
    await expect(hardDeleteRssFeedChildPage(feed.id, 'crawls')).resolves.toMatchObject({
      removed: 1,
      hasMore: false,
    })
    await expect(finalizeHardDeleteRssFeed(feed.id)).resolves.toMatchObject({
      deleted: true,
      remaining: null,
    })
    expect(await countTestFeedRows(feed.id)).toBe(0)
  })
})
