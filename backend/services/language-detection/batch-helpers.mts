import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import {
  computeDetectionKey,
  runDetectionMany,
  type DetectionInput,
  type DetectionOutput,
} from './detect.mts'
import {
  writeLanguageDetectionResults,
  type CommunityGuard,
  type CrawlGuard,
  type DetectedWriteFields,
  type LanguageDetectionWriteBatch,
  type PostGuard,
  type RssFeedItemGuard,
  type TopicGuard,
  type UserGuard,
} from './write-results.mts'

type BatchRowBase = {
  id: string
  text: string
  declaredLanguage: string | null
  inputSha256: Buffer | null
}

export type LanguageDetectionBatch =
  | { table: 'posts'; rows: Array<BatchRowBase & PostGuard> }
  | { table: 'rss_feed_items'; rows: Array<BatchRowBase & RssFeedItemGuard> }
  | { table: 'crawls'; rows: Array<BatchRowBase & CrawlGuard> }
  | { table: 'communities'; rows: Array<BatchRowBase & CommunityGuard> }
  | { table: 'users'; rows: Array<BatchRowBase & UserGuard> }
  | { table: 'topics'; rows: Array<BatchRowBase & TopicGuard> }

async function detectPendingRows<Row extends BatchRowBase>(
  rows: readonly Row[],
): Promise<Array<Omit<Row, keyof DetectedWriteFields> & DetectedWriteFields>> {
  // Use the declared language in the key so changing a declared language triggers re-detection
  // even when text hasn't changed — matches the single-entity computeDetectionKey convention.
  const pending: Array<{ row: Row; normalizedLanguage: string | null; inputSha256: Buffer }> = []
  for (const row of rows) {
    const normalizedLanguage = normalizeContentLanguageTag(row.declaredLanguage)
    const inputSha256 = computeDetectionKey(row.text, normalizedLanguage)
    if (row.inputSha256 == null || !row.inputSha256.equals(inputSha256)) {
      pending.push({ row, normalizedLanguage, inputSha256 })
    }
  }
  if (pending.length === 0) return []

  const inputs: DetectionInput[] = pending.map(({ row, normalizedLanguage }) => ({
    text: row.text,
    declaredLanguage: normalizedLanguage,
  }))
  const outputs = await runDetectionMany(inputs)
  return pending.map(({ row, inputSha256 }, i) => ({
    ...row,
    ...toDetectedWriteFields(row.id, inputSha256, outputs[i]!),
  }))
}

function toDetectedWriteFields(
  id: string,
  inputSha256: Buffer,
  output: DetectionOutput,
): DetectedWriteFields {
  return {
    id,
    detectedLanguage: output.linguaRsDetectedLanguage,
    contentSha256: output.contentSha256,
    inputSha256,
    resultsJson: JSON.stringify(output.results),
  }
}

export async function runBatch(batch: LanguageDetectionBatch): Promise<{ updated: number }> {
  const writeBatch = await buildWriteBatch(batch)
  if (!writeBatch) return { updated: 0 }
  const updatedIds = await writeLanguageDetectionResults(writeBatch)
  return { updated: updatedIds.length }
}

async function detectTableBatch<
  Table extends LanguageDetectionBatch['table'],
  Row extends BatchRowBase,
>(
  table: Table,
  rows: readonly Row[],
): Promise<{
  table: Table
  rows: Array<Omit<Row, keyof DetectedWriteFields> & DetectedWriteFields>
} | null> {
  const detected = await detectPendingRows(rows)
  return detected.length === 0 ? null : { table, rows: detected }
}

async function buildWriteBatch(
  batch: LanguageDetectionBatch,
): Promise<LanguageDetectionWriteBatch | null> {
  switch (batch.table) {
    case 'posts':
      return detectTableBatch('posts', batch.rows)
    case 'rss_feed_items':
      return detectTableBatch('rss_feed_items', batch.rows)
    case 'crawls':
      return detectTableBatch('crawls', batch.rows)
    case 'communities':
      return detectTableBatch('communities', batch.rows)
    case 'users':
      return detectTableBatch('users', batch.rows)
    case 'topics':
      return detectTableBatch('topics', batch.rows)
  }
}
