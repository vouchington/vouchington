import { describe, expect, it, onTestFinished } from 'vitest'
import { read, write } from '@data-stores/psql'
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
    onTestFinished(async () => {
      await write('/* cleanupHardDeleteHistoryGuardTest */ DELETE FROM rss_feeds WHERE id = $1', [
        feed.id,
      ])
    })
    const { rows: changes } = await read<{ id: string }>(
      '/* readHardDeleteHistoryGuardTest */ SELECT id FROM rss_feed_setting_changes WHERE rss_feed_id = $1::uuid ORDER BY id LIMIT 1',
      [feed.id],
    )
    const changeId = changes[0]?.id
    if (!changeId) throw new Error('Expected feed setting history')
    await expect(
      write(
        '/* rejectActiveFeedHistoryDeleteTest */ DELETE FROM rss_feed_setting_changes WHERE id = $1::uuid',
        [changeId],
      ),
    ).rejects.toMatchObject({ code: '23514' })

    const post = await createTestPost({ user })
    const { rows: clearance } = await read<{ id: string }>(
      '/* readUnrelatedLedgerTest */ SELECT id FROM post_clearance_changes WHERE post_id = $1::uuid ORDER BY id LIMIT 1',
      [post.id],
    )
    if (!clearance[0]) throw new Error('Expected unrelated append-only history')
    await expect(
      write(
        '/* rejectUnrelatedLedgerDeleteTest */ DELETE FROM post_clearance_changes WHERE id = $1::uuid',
        [clearance[0].id],
      ),
    ).rejects.toMatchObject({ code: '23514' })

    await hardDeleteRssFeedById(feed.id)
    await expect(
      write(
        `/* rejectPendingFeedHistoryUpdateTest */
       UPDATE rss_feed_setting_changes SET reason = 'changed' WHERE id = $1::uuid`,
        [changeId],
      ),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(
        '/* allowMarkedFeedHistoryDeleteTest */ DELETE FROM rss_feed_setting_changes WHERE id = $1::uuid',
        [changeId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 })
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
    onTestFinished(async () => {
      await write('/* cleanupHardDeleteFenceTest */ DELETE FROM rss_feeds WHERE id = $1', [feed.id])
    })
    await expect(hardDeleteRssFeedById(feed.id)).resolves.toBe(true)
    await expect(
      write(
        `/* verifyHardDeleteFenceTest */
        INSERT INTO rss_feed_crawls (rss_feed_id, response_code) VALUES ($1::uuid, 200)`,
        [feed.id],
      ),
    ).rejects.toMatchObject({ code: '23514' })
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
    const { rows: batches } = await write<{ id: string }>(
      `/* seedHardDeleteUserImportTest:batch */
      INSERT INTO user_rss_feed_import_batches
        (user_id, created_via, total_rows, completed_rows, completed_at)
      VALUES ($1::uuid, 'system', 1, 1, CURRENT_TIMESTAMP) RETURNING id`,
      [user.id],
    )
    const batchId = batches[0]!.id
    onTestFinished(async () => {
      await write(
        '/* cleanupHardDeleteUserImportTest:batch */ DELETE FROM user_rss_feed_import_batches WHERE id = $1',
        [batchId],
      )
      await write(
        '/* cleanupHardDeleteUserImportTest:feed */ DELETE FROM rss_feeds WHERE id = $1',
        [feed.id],
      )
    })
    await write(
      `/* seedHardDeleteUserImportTest:row */
      INSERT INTO user_rss_feed_import_rows
        (batch_id, row_index, input_url, outcome, rss_feed_id, completed_at)
      VALUES ($1::uuid, 0, $2, 'imported', $3::uuid, CURRENT_TIMESTAMP)`,
      [batchId, `https://rss-import-result-${nonce}.example.com/feed.xml`, feed.id],
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
    const { rows: batches } = await write<{ id: string }>(
      `/* seedHardDeleteAdminImportTest:batch */
      INSERT INTO admin_import_batches(import_type, created_by_id, total_rows, completed_rows, completed_at)
      VALUES ('rss_feed', $1::uuid, 1, 1, CURRENT_TIMESTAMP) RETURNING id`,
      [user.id],
    )
    const batchId = batches[0]!.id
    onTestFinished(async () => {
      await write(
        '/* cleanupHardDeleteAdminImportTest:batch */ DELETE FROM admin_import_batches WHERE id = $1',
        [batchId],
      )
      await write(
        '/* cleanupHardDeleteAdminImportTest:feed */ DELETE FROM rss_feeds WHERE id = $1',
        [feed.id],
      )
    })
    await write(
      `/* seedHardDeleteAdminImportTest:row */
      INSERT INTO admin_import_rows(batch_id, row_index, input_data, rss_feed_id, completed_at)
      VALUES ($1::uuid, 0, '{}'::jsonb, $2::uuid, CURRENT_TIMESTAMP)`,
      [batchId, feed.id],
    )
    await expect(hardDeleteRssFeedById(feed.id)).rejects.toMatchObject({ status: 409 })
    const { rows } = await read<{ hard_delete_requested_at: Date | null }>(
      `/* verifyHardDeleteAdminImportTest */
      SELECT hard_delete_requested_at FROM rss_feeds WHERE id = $1::uuid`,
      [feed.id],
    )
    expect(rows[0]?.hard_delete_requested_at).toBeNull()
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
    onTestFinished(async () => {
      await write('/* cleanupHardDeleteChildPageTest */ DELETE FROM rss_feeds WHERE id = $1', [
        feed.id,
      ])
    })
    await write(
      `/* seedHardDeleteChildPageTest */
      INSERT INTO rss_feed_crawls (rss_feed_id, response_code)
      SELECT $1::uuid, 200 FROM generate_series(1, 3)`,
      [feed.id],
    )
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
    const { rows } = await read<{ count: number }>(
      '/* verifyHardDeleteChildPageTest */ SELECT count(*)::integer AS count FROM rss_feeds WHERE id = $1',
      [feed.id],
    )
    expect(rows[0]?.count).toBe(0)
  })
})
