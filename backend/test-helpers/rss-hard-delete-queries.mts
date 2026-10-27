import { read, write } from '@data-stores/psql'

export async function readTestRssFeedDeleteMarker(feedId: string): Promise<Date | null> {
  const { rows } = await read<{ hard_delete_requested_at: Date | null }>(
    '/* readTestRssFeedDeleteMarker */ SELECT hard_delete_requested_at FROM rss_feeds WHERE id = $1::uuid',
    [feedId],
  )
  return rows[0]?.hard_delete_requested_at ?? null
}

export async function deleteTestRssFeedRow(feedId: string): Promise<void> {
  await write('/* deleteTestRssFeedRow */ DELETE FROM rss_feeds WHERE id = $1', [feedId])
}

export async function readTestFirstFeedSettingChange(feedId: string): Promise<string | null> {
  const { rows } = await read<{ id: string }>(
    '/* readTestFirstFeedSettingChange */ SELECT id FROM rss_feed_setting_changes WHERE rss_feed_id = $1::uuid ORDER BY id LIMIT 1',
    [feedId],
  )
  return rows[0]?.id ?? null
}

export async function deleteTestFeedSettingChange(changeId: string): Promise<number> {
  const result = await write(
    '/* deleteTestFeedSettingChange */ DELETE FROM rss_feed_setting_changes WHERE id = $1::uuid',
    [changeId],
  )
  return result.rowCount ?? 0
}

export async function updateTestFeedSettingChangeReason(changeId: string): Promise<void> {
  await write(
    `/* updateTestFeedSettingChangeReason */ UPDATE rss_feed_setting_changes
     SET reason = 'changed' WHERE id = $1::uuid`,
    [changeId],
  )
}

export async function readTestFirstPostClearanceChange(postId: string): Promise<string | null> {
  const { rows } = await read<{ id: string }>(
    '/* readTestFirstPostClearanceChange */ SELECT id FROM post_clearance_changes WHERE post_id = $1::uuid ORDER BY id LIMIT 1',
    [postId],
  )
  return rows[0]?.id ?? null
}

export async function deleteTestPostClearanceChange(changeId: string): Promise<void> {
  await write(
    '/* deleteTestPostClearanceChange */ DELETE FROM post_clearance_changes WHERE id = $1::uuid',
    [changeId],
  )
}

export async function insertTestFeedCrawl(feedId: string): Promise<void> {
  await write(
    '/* insertTestFeedCrawl */ INSERT INTO rss_feed_crawls (rss_feed_id, response_code) VALUES ($1::uuid, 200)',
    [feedId],
  )
}

export async function insertThreeTestFeedCrawls(feedId: string): Promise<void> {
  await write(
    `/* insertThreeTestFeedCrawls */ INSERT INTO rss_feed_crawls (rss_feed_id, response_code)
     SELECT $1::uuid, 200 FROM generate_series(1, 3)`,
    [feedId],
  )
}

export async function insertCompletedTestUserImportBatch(userId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* insertCompletedTestUserImportBatch */ INSERT INTO user_rss_feed_import_batches
     (user_id, created_via, total_rows, completed_rows, completed_at)
     VALUES ($1::uuid, 'system', 1, 1, CURRENT_TIMESTAMP) RETURNING id`,
    [userId],
  )
  return rows[0]!.id
}

export async function deleteTestUserImportBatch(batchId: string): Promise<void> {
  await write(
    '/* deleteTestUserImportBatch */ DELETE FROM user_rss_feed_import_batches WHERE id = $1',
    [batchId],
  )
}

export async function insertCompletedTestUserImportRow(
  batchId: string,
  inputUrl: string,
  feedId: string,
): Promise<void> {
  await write(
    `/* insertCompletedTestUserImportRow */ INSERT INTO user_rss_feed_import_rows
     (batch_id, row_index, input_url, outcome, rss_feed_id, completed_at)
     VALUES ($1::uuid, 0, $2, 'imported', $3::uuid, CURRENT_TIMESTAMP)`,
    [batchId, inputUrl, feedId],
  )
}

export async function insertCompletedTestAdminImportBatch(userId: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* insertCompletedTestAdminImportBatch */ INSERT INTO admin_import_batches
     (import_type, created_by_id, total_rows, completed_rows, completed_at)
     VALUES ('rss_feed', $1::uuid, 1, 1, CURRENT_TIMESTAMP) RETURNING id`,
    [userId],
  )
  return rows[0]!.id
}

export async function deleteTestAdminImportBatch(batchId: string): Promise<void> {
  await write('/* deleteTestAdminImportBatch */ DELETE FROM admin_import_batches WHERE id = $1', [
    batchId,
  ])
}

export async function insertCompletedTestAdminImportRow(
  batchId: string,
  feedId: string,
): Promise<void> {
  await write(
    `/* insertCompletedTestAdminImportRow */ INSERT INTO admin_import_rows
     (batch_id, row_index, input_data, rss_feed_id, completed_at)
     VALUES ($1::uuid, 0, '{}'::jsonb, $2::uuid, CURRENT_TIMESTAMP)`,
    [batchId, feedId],
  )
}

export async function countTestFeedRows(feedId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    '/* countTestFeedRows */ SELECT count(*)::integer AS count FROM rss_feeds WHERE id = $1',
    [feedId],
  )
  return rows[0]?.count ?? 0
}

export async function countTestPosts(postIds: readonly string[]): Promise<number> {
  const { rows } = await read<{ count: number }>(
    '/* countTestPosts */ SELECT COUNT(*)::integer AS count FROM posts WHERE id = ANY($1::uuid[])',
    [postIds],
  )
  return rows[0]?.count ?? 0
}

export async function countTestPendingCategoryReconciliations(
  postIds: readonly string[],
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* countTestPendingCategoryReconciliations */ SELECT COUNT(*)::integer AS count
     FROM rss_feed_item_category_snapshot_reconciliations reconciliation
     JOIN rss_feed_items item ON item.id = reconciliation.rss_feed_item_id
     JOIN story_posts story_post ON story_post.story_id = item.story_id
     WHERE story_post.post_id = ANY($1::uuid[])`,
    [postIds],
  )
  return rows[0]?.count ?? 0
}

/** Arrange a defensive marked+referenced state without bypassing insertion fences. */
export async function markReferencedTestRssFeedForDeletion(feedId: string): Promise<void> {
  await write(
    `/* markReferencedTestRssFeedForDeletion */
    UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP,
      hard_delete_requested_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    [feedId],
  )
}

/** Select the exact synthetic UUID as the first key in a dirty-database recovery page. */
export function beforeTestRssFeedUuid(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function countTestHardDeleteFeedCrawls(feedId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* countTestHardDeleteFeedCrawls */
    SELECT count(*)::integer AS count FROM rss_feed_crawls WHERE rss_feed_id = $1::uuid AND id > $1::uuid`,
    [feedId],
  )
  return rows[0]?.count ?? 0
}
