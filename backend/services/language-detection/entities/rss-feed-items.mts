import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { writeLanguageDetectionResults } from '../write-results.mts'
import { computeDetectionKey, runDetection } from '../detect.mts'
import { firstVisibleRssTextField } from '@modules/utils/rss-text-fields'

export async function detectRssFeedItemLanguage(itemId: string): Promise<void> {
  const { rows } = await read<{
    id: string
    data: Record<string, unknown>
    declared_language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectRssFeedItemLanguage */
    SELECT
      rfi.id,
      rfi.data,
      rf.declared_language,
      rfi.lingua_rs_input_sha256
    FROM rss_feed_items rfi
    JOIN rss_feeds rf ON rf.id = (
      SELECT rfis.rss_feed_id
      FROM rss_feed_item_sources rfis
      JOIN rss_feeds rf2 ON rf2.id = rfis.rss_feed_id
      JOIN topics t ON t.id = rf2.topic_id
      WHERE rfis.rss_feed_item_id = rfi.id
        AND rf2.deleted_at IS NULL
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      ORDER BY
        rf2.is_enabled DESC,
        rf2.is_discoverable DESC,
        t.votes_score_sort DESC,
        rfis.created_at ASC
      LIMIT 1
    )
    WHERE rfi.id = ${itemId}
      AND rfi.deleted_at IS NULL
    LIMIT 1
  `)

  let item = rows[0]

  // Fallback: load item without feed join if no feed assignment exists yet
  if (!item) {
    const { rows: fallbackRows } = await read<{
      id: string
      data: Record<string, unknown>
      declared_language: null
      lingua_rs_input_sha256: Buffer | null
    }>(sql`/* detectRssFeedItemLanguage:fallback */
      SELECT id, data, NULL::text AS declared_language, lingua_rs_input_sha256
      FROM rss_feed_items
      WHERE id = ${itemId}
        AND deleted_at IS NULL
      LIMIT 1
    `)
    item = fallbackRows[0]
  }

  if (!item) return

  const data = item.data
  const title = typeof data['title'] === 'string' ? data['title'] : ''
  const content = firstVisibleRssTextField([
    data['content:encodedSnippet'],
    data['content:encoded'],
    data['contentSnippet'],
    data['content'],
    data['summary'],
    data['description'],
    data['media:description'],
  ])

  const text = [title, content].filter(Boolean).join('\n\n')
  // Include feed declared_language in key so changing it triggers re-detection
  const declaredLanguage = normalizeContentLanguageTag(item.declared_language)
  const detectionKey = computeDetectionKey(text, declaredLanguage)
  if (item.lingua_rs_input_sha256?.equals(detectionKey)) return

  const output = await runDetection(text, declaredLanguage)

  await writeLanguageDetectionResults({
    table: 'rss_feed_items',
    rows: [
      {
        id: itemId,
        detectedLanguage: output.linguaRsDetectedLanguage,
        contentSha256: output.contentSha256,
        inputSha256: detectionKey,
        resultsJson: JSON.stringify(output.results),
        data: item.data,
      },
    ],
  })
}
