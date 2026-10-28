import { beginTransaction, write } from '@data-stores/psql'

type TestTransaction = Awaited<ReturnType<typeof beginTransaction>>

export async function deleteTestUserImportBatch(batchId: string): Promise<void> {
  await write(
    '/* deleteTestUserImportBatch */ DELETE FROM user_rss_feed_import_batches WHERE id = $1',
    [batchId],
  )
}

export async function createCompletedTestUserImportWithFeed(
  userId: string,
  inputUrl: string,
  feedId: string,
): Promise<string> {
  await using query = await beginTransaction()
  const batchId = await insertOpenUserImportAndRow(query, userId, inputUrl, feedId)
  await completeUserImportAndCommit(query, batchId)
  return batchId
}

async function insertOpenUserImportAndRow(
  query: TestTransaction,
  userId: string,
  inputUrl: string,
  feedId: string,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `/* insertOpenTestUserImportBatch */ INSERT INTO user_rss_feed_import_batches
     (user_id, created_via, total_rows)
     VALUES ($1::uuid, 'system', 1) RETURNING id`,
    [userId],
  )
  const batchId = rows[0]!.id
  await query(
    `/* insertTestUserImportFeedRow */ INSERT INTO user_rss_feed_import_rows
     (batch_id, row_index, input_url, outcome, rss_feed_id, completed_at)
     VALUES ($1::uuid, 0, $2, 'imported', $3::uuid, CURRENT_TIMESTAMP)`,
    [batchId, inputUrl, feedId],
  )
  return batchId
}

async function completeUserImportAndCommit(query: TestTransaction, batchId: string): Promise<void> {
  await query(
    `/* completeTestUserImportBatch */ UPDATE user_rss_feed_import_batches
     SET completed_rows = 1, completed_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    [batchId],
  )
  await query.commit()
}

export async function createCompletedTestAdminImportWithFeed(
  userId: string,
  feedId: string,
): Promise<string> {
  await using query = await beginTransaction()
  const batchId = await insertOpenAdminImportAndRow(query, userId, feedId)
  await completeAdminImportAndCommit(query, batchId)
  return batchId
}

export async function deleteTestAdminImportBatch(batchId: string): Promise<void> {
  await write('/* deleteTestAdminImportBatch */ DELETE FROM admin_import_batches WHERE id = $1', [
    batchId,
  ])
}

async function insertOpenAdminImportAndRow(
  query: TestTransaction,
  userId: string,
  feedId: string,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `/* insertOpenTestAdminImportBatch */ INSERT INTO admin_import_batches
     (import_type, created_by_id, total_rows)
     VALUES ('rss_feed', $1::uuid, 1) RETURNING id`,
    [userId],
  )
  const batchId = rows[0]!.id
  await query(
    `/* insertTestAdminImportFeedRow */ INSERT INTO admin_import_rows
     (batch_id, row_index, input_data, rss_feed_id, completed_at)
     VALUES ($1::uuid, 0, '{}'::jsonb, $2::uuid, CURRENT_TIMESTAMP)`,
    [batchId, feedId],
  )
  return batchId
}

async function completeAdminImportAndCommit(
  query: TestTransaction,
  batchId: string,
): Promise<void> {
  await query(
    `/* completeTestAdminImportBatch */ UPDATE admin_import_batches
     SET completed_rows = 1, completed_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
    [batchId],
  )
  await query.commit()
}
