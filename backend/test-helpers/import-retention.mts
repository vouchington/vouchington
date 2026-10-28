import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUrlWithHostname } from './entities/urls.mts'

type Family = 'admin' | 'rss'

export async function createIncompleteImportRetentionBatch(
  family: Family,
  userId: string,
): Promise<string> {
  if (family === 'admin') {
    const { rows } = await write<{ id: string }>(sql`/* createIncompleteAdminImportRetentionBatch */
      INSERT INTO admin_import_batches (import_type, created_by_id, total_rows)
      VALUES ('topic', ${userId}, 1) RETURNING id`)
    return rows[0]!.id
  }
  const { rows } = await write<{ id: string }>(sql`/* createIncompleteRssImportRetentionBatch */
    INSERT INTO user_rss_feed_import_batches (user_id, created_via, total_rows)
    VALUES (${userId}, 'web', 1) RETURNING id`)
  return rows[0]!.id
}

export async function createCompletedImportRetentionFixture(
  family: Family,
  userId: string,
  completedAt: Date,
): Promise<string> {
  const discoveryUrlId = family === 'rss' ? await createTestUrlWithHostname() : null
  await using query = await beginTransaction()
  if (family === 'admin') {
    const { rows: batches } = await query<{
      id: string
    }>(sql`/* createCompletedAdminImportRetentionFixture:batch */
      INSERT INTO admin_import_batches (import_type, created_by_id, total_rows)
      VALUES ('topic', ${userId}, 2) RETURNING id`)
    const batchId = batches[0]!.id
    await query(sql`/* createCompletedAdminImportRetentionFixture:rows */
      INSERT INTO admin_import_rows (batch_id, row_index, input_data, failed_at, error_message)
      SELECT ${batchId}, seed.row_index, '{}'::jsonb, ${completedAt}, 'invalid input'
      FROM generate_series(0, 1) AS seed(row_index)`)
    await query(sql`/* createCompletedAdminImportRetentionFixture:complete */
      UPDATE admin_import_batches SET failed_rows = 2, completed_at = ${completedAt}
      WHERE id = ${batchId}`)
    await query.commit()
    return batchId
  }
  const { rows: batches } = await query<{
    id: string
  }>(sql`/* createCompletedRssImportRetentionFixture:batch */
    INSERT INTO user_rss_feed_import_batches (user_id, created_via, total_rows)
    VALUES (${userId}, 'web', 2) RETURNING id`)
  const batchId = batches[0]!.id
  const { rows: importedRows } = await query<{
    id: string
    row_index: number
  }>(sql`/* createCompletedRssImportRetentionFixture:rows */
    INSERT INTO user_rss_feed_import_rows
      (batch_id, row_index, input_url, outcome, failed_at, error_message)
    SELECT ${batchId}, seed.row_index, 'https://example.com/invalid', 'error',
      ${completedAt}, 'invalid feed'
    FROM generate_series(0, 1) AS seed(row_index)
    RETURNING id, row_index`)
  await query(sql`/* createCompletedRssImportRetentionFixture:discovery */
    INSERT INTO user_rss_feed_import_row_discoveries
      (import_row_id, batch_id, discovery_url_id, generation)
    VALUES (${importedRows.find(row => row.row_index === 0)!.id}, ${batchId}, ${discoveryUrlId}, uuidv7())`)
  await query(sql`/* createCompletedRssImportRetentionFixture:complete */
    UPDATE user_rss_feed_import_batches SET failed_rows = 2, completed_at = ${completedAt}
    WHERE id = ${batchId}`)
  await query.commit()
  return batchId
}

export async function countImportRetentionRows(
  family: Family,
  batchId: string,
): Promise<{ batches: number; rows: number; discoveries: number }> {
  if (family === 'admin') {
    const { rows } = await write<{
      batches: string
      rows: string
    }>(sql`/* countAdminImportRetentionRows */
      SELECT (SELECT count(*) FROM admin_import_batches WHERE id = ${batchId}) AS batches,
             (SELECT count(*) FROM admin_import_rows WHERE batch_id = ${batchId}) AS rows`)
    return { batches: Number(rows[0]!.batches), rows: Number(rows[0]!.rows), discoveries: 0 }
  }
  const { rows } = await write<{
    batches: string
    rows: string
    discoveries: string
  }>(sql`/* countRssImportRetentionRows */
    SELECT (SELECT count(*) FROM user_rss_feed_import_batches WHERE id = ${batchId}) AS batches,
           (SELECT count(*) FROM user_rss_feed_import_rows WHERE batch_id = ${batchId}) AS rows,
           (SELECT count(*) FROM user_rss_feed_import_row_discoveries WHERE batch_id = ${batchId}) AS discoveries`)
  return {
    batches: Number(rows[0]!.batches),
    rows: Number(rows[0]!.rows),
    discoveries: Number(rows[0]!.discoveries),
  }
}

export async function insertLateImportRowForRetention(
  family: Family,
  batchId: string,
): Promise<void> {
  if (family === 'admin') {
    await write(sql`/* insertLateImportRowForRetention:admin */
      INSERT INTO admin_import_rows (batch_id, row_index, input_data)
      VALUES (${batchId}, 2, '{}'::jsonb)`)
    return
  }
  await write(sql`/* insertLateImportRowForRetention:rss */
    INSERT INTO user_rss_feed_import_rows (batch_id, row_index, input_url)
    VALUES (${batchId}, 2, 'https://example.com/late')`)
}

export async function insertLateImportDiscoveryForRetention(batchId: string): Promise<void> {
  const urlId = await createTestUrlWithHostname()
  await write(sql`/* insertLateImportDiscoveryForRetention */
    INSERT INTO user_rss_feed_import_row_discoveries
      (import_row_id, batch_id, discovery_url_id, generation)
    SELECT import_row.id, import_row.batch_id, ${urlId}, uuidv7()
    FROM user_rss_feed_import_rows import_row
    WHERE import_row.batch_id = ${batchId}
    ORDER BY import_row.id LIMIT 1`)
}
