import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { computeContentSha256, computeDetectionKey, runDetection } from '../detect.mts'
import { detectLanguage } from '../detector.mts'
import { invalidate } from '@services/entity-cache/invalidate'

type EntityDetectionDependencies = {
  detectLanguage: typeof detectLanguage
}

export async function detectUserLanguage(
  userId: string,
  dependencies?: Partial<EntityDetectionDependencies>,
): Promise<void> {
  const { rows } = await read<{
    id: string
    markdown: string
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectUserLanguage */
    SELECT id, COALESCE(markdown, '') AS markdown, lingua_rs_input_sha256
    FROM users
    WHERE id = ${userId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const user = rows[0]
  if (!user) return

  const text = user.markdown
  const contentSha256 = computeContentSha256(text)
  const detectionKey = computeDetectionKey(text, null)

  // Skip if input hasn't changed
  if (user.lingua_rs_input_sha256 != null) {
    const existing = user.lingua_rs_input_sha256
    if (existing.equals(detectionKey)) return
  }

  // Users have no declared language for their bio
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const output = await runDetection(text, null, undefined, dependencies)

  await write(sql`/* detectUserLanguage:update */
    UPDATE users SET
      lingua_rs_detected_language = ${output.linguaRsDetectedLanguage},
      lingua_rs_content_sha256 = ${contentSha256},
      lingua_rs_input_sha256 = ${detectionKey},
      lingua_rs_results = ${JSON.stringify(output.results)},
      lingua_rs_detected_at = NOW()
    WHERE id = ${userId}
      AND COALESCE(markdown, '') IS NOT DISTINCT FROM ${user.markdown}
  `)
  await invalidate.users(userId)
}
