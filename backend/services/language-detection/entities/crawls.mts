import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { computeContentSha256, computeDetectionKey, runDetection } from '../detect.mts'
import { detectLanguage } from '../detector.mts'

type EntityDetectionDependencies = {
  detectLanguage: typeof detectLanguage
}

export async function detectCrawlLanguage(
  crawlId: string,
  dependencies?: Partial<EntityDetectionDependencies>,
): Promise<void> {
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

  const output = await runDetection(text, declaredLanguage, undefined, dependencies)
  const contentSha256 = computeContentSha256(text)

  await write(sql`/* detectCrawlLanguage:update */
    UPDATE crawls SET
      lingua_rs_detected_language = ${output.linguaRsDetectedLanguage},
      lingua_rs_content_sha256 = ${contentSha256},
      lingua_rs_input_sha256 = ${detectionKey},
      lingua_rs_results = ${JSON.stringify(output.results)},
      lingua_rs_detected_at = NOW()
    WHERE id = ${crawlId}
      AND title IS NOT DISTINCT FROM ${crawl.title}
      AND markdown IS NOT DISTINCT FROM ${crawl.markdown}
      AND language IS NOT DISTINCT FROM ${crawl.language}
  `)
}
