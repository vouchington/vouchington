import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { writeLanguageDetectionResults } from '../write-results.mts'
import { computeDetectionKey, runDetection } from '../detect.mts'

export async function detectCrawlLanguage(crawlId: string): Promise<void> {
  const { rows } = await read<{
    id: string
    title: string | null
    markdown: string
    language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectCrawlLanguage */
    SELECT id, title, markdown, language, lingua_rs_input_sha256
    FROM crawls
    WHERE id = ${crawlId}
    LIMIT 1
  `)
  const crawl = rows[0]
  if (!crawl) return

  const text = [crawl.title, crawl.markdown].filter(Boolean).join('\n\n')
  // Include the <html language> attribute so a newly-set or changed language triggers re-detection
  const declaredLanguage = normalizeContentLanguageTag(crawl.language)
  const detectionKey = computeDetectionKey(text, declaredLanguage)
  if (crawl.lingua_rs_input_sha256?.equals(detectionKey)) return

  const output = await runDetection(text, declaredLanguage)

  await writeLanguageDetectionResults({
    table: 'crawls',
    rows: [
      {
        id: crawlId,
        detectedLanguage: output.linguaRsDetectedLanguage,
        contentSha256: output.contentSha256,
        inputSha256: detectionKey,
        resultsJson: JSON.stringify(output.results),
        title: crawl.title,
        markdown: crawl.markdown,
        language: crawl.language,
      },
    ],
  })
}
