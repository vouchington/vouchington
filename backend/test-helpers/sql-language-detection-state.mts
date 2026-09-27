import { read, write } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'

export async function setCommunityLanguageDetectionFieldsForTest(
  communityId: string,
): Promise<void> {
  await write(sql`/* setCommunityLanguageDetectionFieldsForTest */
    UPDATE communities
    SET
      lingua_rs_detected_language = 'fr',
      lingua_rs_content_sha256 = ${Buffer.alloc(32, 1)},
      lingua_rs_input_sha256 = ${Buffer.alloc(32, 2)},
      lingua_rs_results = ${JSON.stringify({ detector: 'test' })},
      lingua_rs_detected_at = NOW()
    WHERE id = ${communityId}
  `)
}

type LanguageDetectionEntityTable =
  | 'posts'
  | 'communities'
  | 'crawls'
  | 'users'
  | 'topics'
  | 'rss_feed_items'

export type LanguageDetectionStateForTest = {
  lingua_rs_detected_language: string | null
  lingua_rs_input_sha256: Buffer | null
  lingua_rs_detected_at: Date | null
}

export async function getLanguageDetectionStateForTest(
  table: LanguageDetectionEntityTable,
  id: string,
): Promise<LanguageDetectionStateForTest> {
  const query = sql`/* getLanguageDetectionStateForTest */
    SELECT lingua_rs_detected_language, lingua_rs_input_sha256, lingua_rs_detected_at
    FROM `
  query.append(sqlTableForLanguageDetection(table))
  query.append(sql` WHERE id = ${id}`)
  const { rows } = await read<LanguageDetectionStateForTest>(query)
  return rows[0]!
}

export async function setRssFeedItemLanguageInputShaForTest(
  itemId: string,
  inputSha256: Buffer,
): Promise<void> {
  await write(sql`/* setRssFeedItemLanguageInputShaForTest */
    UPDATE rss_feed_items
    SET lingua_rs_input_sha256 = ${inputSha256}
    WHERE id = ${itemId}
  `)
}

function sqlTableForLanguageDetection(table: LanguageDetectionEntityTable): SQLStatement {
  switch (table) {
    case 'posts':
      return sql`posts`
    case 'communities':
      return sql`communities`
    case 'crawls':
      return sql`crawls`
    case 'users':
      return sql`users`
    case 'topics':
      return sql`topics`
    case 'rss_feed_items':
      return sql`rss_feed_items`
  }
}
