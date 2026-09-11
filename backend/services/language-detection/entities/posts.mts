import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { computeContentSha256, computeDetectionKey, runDetection } from '../detect.mts'
import { detectLanguage } from '../detector.mts'
import { invalidate } from '@services/entity-cache/invalidate'

type EntityDetectionDependencies = {
  detectLanguage: typeof detectLanguage
}

export async function detectPostLanguage(
  postId: string,
  dependencies?: Partial<EntityDetectionDependencies>,
): Promise<void> {
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

  const output = await runDetection(text, declaredLanguage, undefined, dependencies)
  const contentSha256 = computeContentSha256(text)

  await write(sql`/* detectPostLanguage:update */
    UPDATE posts SET
      lingua_rs_detected_language = ${output.linguaRsDetectedLanguage},
      lingua_rs_content_sha256 = ${contentSha256},
      lingua_rs_input_sha256 = ${detectionKey},
      lingua_rs_results = ${JSON.stringify(output.results)},
      lingua_rs_detected_at = NOW()
    WHERE id = ${postId}
      AND title IS NOT DISTINCT FROM ${post.title}
      AND markdown IS NOT DISTINCT FROM ${post.markdown}
      AND declared_language IS NOT DISTINCT FROM ${post.declared_language}
  `)
  await invalidate.posts(postId)
}
