import { write } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'

export type DetectedWriteFields = {
  id: string
  detectedLanguage: string | null
  contentSha256: Buffer
  inputSha256: Buffer
  resultsJson: string
}

export type PostGuard = {
  title: string | null
  markdown: string | null
  declaredLanguage: string | null
}
export type RssFeedItemGuard = { data: Record<string, unknown> }
export type CrawlGuard = { title: string | null; markdown: string; language: string | null }
export type CommunityGuard = {
  name: string
  markdown: string | null
  defaultLanguage: string | null
}
export type UserGuard = { markdown: string | null }
export type TopicGuard = { name: string; markdown: string | null }

export type LanguageDetectionWriteBatch =
  | { table: 'posts'; rows: Array<DetectedWriteFields & PostGuard> }
  | { table: 'rss_feed_items'; rows: Array<DetectedWriteFields & RssFeedItemGuard> }
  | { table: 'crawls'; rows: Array<DetectedWriteFields & CrawlGuard> }
  | { table: 'communities'; rows: Array<DetectedWriteFields & CommunityGuard> }
  | { table: 'users'; rows: Array<DetectedWriteFields & UserGuard> }
  | { table: 'topics'; rows: Array<DetectedWriteFields & TopicGuard> }

/**
 * Updates one language-detection entity table in a single set-based statement, keeping each row's
 * staleness guard and issuing at most one batched cache invalidation for the returned ids.
 */
export async function writeLanguageDetectionResults(
  batch: LanguageDetectionWriteBatch,
): Promise<string[]> {
  if (batch.rows.length === 0) return []
  const updatedIds = await executeLanguageDetectionUpdate(batch)
  if (updatedIds.length === 0) return []
  await invalidateLanguageDetectionCaches(batch.table, updatedIds)
  return updatedIds
}

function packCommonColumns<Row extends DetectedWriteFields>(rows: readonly Row[]) {
  return {
    rows,
    ids: rows.map(r => r.id),
    langs: rows.map(r => r.detectedLanguage),
    contentShas: rows.map(r => r.contentSha256),
    inputShas: rows.map(r => r.inputSha256),
    results: rows.map(r => r.resultsJson),
  }
}

async function executeLanguageDetectionUpdate(
  batch: LanguageDetectionWriteBatch,
): Promise<string[]> {
  switch (batch.table) {
    case 'posts': {
      const { rows, ids, langs, contentShas, inputShas, results } = packCommonColumns(batch.rows)
      const { rows: updated } = await write<{ id: string }>(sql`/* updateLanguageDetection:posts */
        UPDATE posts AS t
        SET lingua_rs_detected_language = v.lang, lingua_rs_content_sha256 = v.content_sha,
            lingua_rs_input_sha256 = v.input_sha, lingua_rs_results = v.results,
            lingua_rs_detected_at = NOW()
        FROM unnest(
          ${ids}::uuid[], ${langs}::text[], ${contentShas}::bytea[], ${inputShas}::bytea[],
          ${results}::jsonb[], ${rows.map(r => r.title)}::text[],
          ${rows.map(r => r.markdown)}::text[], ${rows.map(r => r.declaredLanguage)}::text[]
        ) AS v(id, lang, content_sha, input_sha, results, title, markdown, declared_language)
        WHERE t.id = v.id AND t.id = ANY(${ids}::uuid[])
          AND t.title IS NOT DISTINCT FROM v.title AND t.markdown IS NOT DISTINCT FROM v.markdown
          AND t.declared_language IS NOT DISTINCT FROM v.declared_language
        RETURNING t.id`)
      return updated.map(r => r.id)
    }
    case 'rss_feed_items': {
      const { rows, ids, langs, contentShas, inputShas, results } = packCommonColumns(batch.rows)
      const { rows: updated } = await write<{ id: string }>(
        sql`/* updateLanguageDetection:rss_feed_items */
        UPDATE rss_feed_items AS t
        SET lingua_rs_detected_language = v.lang, lingua_rs_content_sha256 = v.content_sha,
            lingua_rs_input_sha256 = v.input_sha, lingua_rs_results = v.results,
            lingua_rs_detected_at = NOW()
        FROM unnest(
          ${ids}::uuid[], ${langs}::text[], ${contentShas}::bytea[], ${inputShas}::bytea[],
          ${results}::jsonb[], ${rows.map(r => JSON.stringify(r.data))}::jsonb[]
        ) AS v(id, lang, content_sha, input_sha, results, data)
        WHERE t.id = v.id AND t.id = ANY(${ids}::uuid[]) AND t.data IS NOT DISTINCT FROM v.data
        RETURNING t.id`,
      )
      return updated.map(r => r.id)
    }
    case 'crawls': {
      const { rows, ids, langs, contentShas, inputShas, results } = packCommonColumns(batch.rows)
      const { rows: updated } = await write<{ id: string }>(sql`/* updateLanguageDetection:crawls */
        UPDATE crawls AS t
        SET lingua_rs_detected_language = v.lang, lingua_rs_content_sha256 = v.content_sha,
            lingua_rs_input_sha256 = v.input_sha, lingua_rs_results = v.results,
            lingua_rs_detected_at = NOW()
        FROM unnest(
          ${ids}::uuid[], ${langs}::text[], ${contentShas}::bytea[], ${inputShas}::bytea[],
          ${results}::jsonb[], ${rows.map(r => r.title)}::text[],
          ${rows.map(r => r.markdown)}::text[], ${rows.map(r => r.language)}::text[]
        ) AS v(id, lang, content_sha, input_sha, results, title, markdown, language)
        WHERE t.id = v.id AND t.id = ANY(${ids}::uuid[])
          AND t.title IS NOT DISTINCT FROM v.title AND t.markdown IS NOT DISTINCT FROM v.markdown
          AND t.language IS NOT DISTINCT FROM v.language
        RETURNING t.id`)
      return updated.map(r => r.id)
    }
    case 'communities': {
      const { rows, ids, langs, contentShas, inputShas, results } = packCommonColumns(batch.rows)
      const { rows: updated } = await write<{ id: string }>(
        sql`/* updateLanguageDetection:communities */
        UPDATE communities AS t
        SET lingua_rs_detected_language = v.lang, lingua_rs_content_sha256 = v.content_sha,
            lingua_rs_input_sha256 = v.input_sha, lingua_rs_results = v.results,
            lingua_rs_detected_at = NOW()
        FROM unnest(
          ${ids}::uuid[], ${langs}::text[], ${contentShas}::bytea[], ${inputShas}::bytea[],
          ${results}::jsonb[], ${rows.map(r => r.name)}::text[],
          ${rows.map(r => r.markdown)}::text[], ${rows.map(r => r.defaultLanguage)}::text[]
        ) AS v(id, lang, content_sha, input_sha, results, name, markdown, default_language)
        WHERE t.id = v.id
          AND t.name IS NOT DISTINCT FROM v.name AND t.markdown IS NOT DISTINCT FROM v.markdown
          AND t.default_language IS NOT DISTINCT FROM v.default_language
        RETURNING t.id`,
      )
      return updated.map(r => r.id)
    }
    case 'users': {
      const { rows, ids, langs, contentShas, inputShas, results } = packCommonColumns(batch.rows)
      const { rows: updated } = await write<{ id: string }>(sql`/* updateLanguageDetection:users */
        UPDATE users AS t
        SET lingua_rs_detected_language = v.lang, lingua_rs_content_sha256 = v.content_sha,
            lingua_rs_input_sha256 = v.input_sha, lingua_rs_results = v.results,
            lingua_rs_detected_at = NOW()
        FROM unnest(
          ${ids}::uuid[], ${langs}::text[], ${contentShas}::bytea[], ${inputShas}::bytea[],
          ${results}::jsonb[], ${rows.map(r => r.markdown)}::text[]
        ) AS v(id, lang, content_sha, input_sha, results, markdown)
        WHERE t.id = v.id AND t.markdown IS NOT DISTINCT FROM v.markdown
        RETURNING t.id`)
      return updated.map(r => r.id)
    }
    case 'topics': {
      const { rows, ids, langs, contentShas, inputShas, results } = packCommonColumns(batch.rows)
      const { rows: updated } = await write<{ id: string }>(sql`/* updateLanguageDetection:topics */
        UPDATE topics AS t
        SET lingua_rs_detected_language = v.lang, lingua_rs_content_sha256 = v.content_sha,
            lingua_rs_input_sha256 = v.input_sha, lingua_rs_results = v.results,
            lingua_rs_detected_at = NOW()
        FROM unnest(
          ${ids}::uuid[], ${langs}::text[], ${contentShas}::bytea[], ${inputShas}::bytea[],
          ${results}::jsonb[], ${rows.map(r => r.name)}::text[], ${rows.map(r => r.markdown)}::text[]
        ) AS v(id, lang, content_sha, input_sha, results, name, markdown)
        WHERE t.id = v.id
          AND t.name IS NOT DISTINCT FROM v.name AND t.markdown IS NOT DISTINCT FROM v.markdown
        RETURNING t.id`)
      return updated.map(r => r.id)
    }
  }
}

async function invalidateLanguageDetectionCaches(
  table: LanguageDetectionWriteBatch['table'],
  updatedIds: readonly string[],
): Promise<void> {
  switch (table) {
    case 'posts':
      return invalidate.posts(...updatedIds)
    case 'rss_feed_items':
      return invalidate.rss_feed_items(...updatedIds)
    case 'users':
      return invalidate.users(...updatedIds)
    case 'topics':
      return invalidate.topics(...updatedIds)
    case 'crawls':
    case 'communities':
      return undefined
  }
}
