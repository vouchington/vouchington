import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { writeLanguageDetectionResults } from '../write-results.mts'
import { computeDetectionKey, runDetection } from '../detect.mts'

export async function detectPostLanguage(postId: string): Promise<void> {
  const { rows } = await read<{
    id: string
    title: string | null
    markdown: string | null
    declared_language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectPostLanguage */
    SELECT id, title, markdown, declared_language, lingua_rs_input_sha256
    FROM posts
    WHERE id = ${postId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const post = rows[0]
  if (!post) return

  const text = [post.title, post.markdown].filter(Boolean).join('\n\n')
  const declaredLanguage = normalizeContentLanguageTag(post.declared_language)

  // Include declared language in the key so changing posts.declared_language re-triggers detection
  const detectionKey = computeDetectionKey(text, declaredLanguage)
  if (post.lingua_rs_input_sha256?.equals(detectionKey)) return

  const output = await runDetection(text, declaredLanguage)

  await writeLanguageDetectionResults({
    table: 'posts',
    rows: [
      {
        id: postId,
        detectedLanguage: output.linguaRsDetectedLanguage,
        contentSha256: output.contentSha256,
        inputSha256: detectionKey,
        resultsJson: JSON.stringify(output.results),
        title: post.title,
        markdown: post.markdown,
        declaredLanguage: post.declared_language,
      },
    ],
  })
}
