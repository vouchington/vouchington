import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { computeContentSha256, computeDetectionKey, runDetection } from '../detect.mts'
import { detectLanguage } from '../detector.mts'

type EntityDetectionDependencies = {
  detectLanguage: typeof detectLanguage
}

export async function detectCommunityLanguage(
  communityId: string,
  dependencies?: Partial<EntityDetectionDependencies>,
): Promise<void> {
  const { rows } = await read<{
    id: string
    name: string
    markdown: string | null
    default_language: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectCommunityLanguage */
    SELECT id, name, markdown, default_language, lingua_rs_input_sha256
    FROM communities
    WHERE id = ${communityId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const community = rows[0]
  if (!community) return

  const text = [community.name, community.markdown].filter(Boolean).join('\n\n')
  const declaredLanguage = normalizeContentLanguageTag(community.default_language)
  // Include declared language so changing default_language re-triggers detection
  const detectionKey = computeDetectionKey(text, declaredLanguage)
  if (community.lingua_rs_input_sha256?.equals(detectionKey)) return

  const output = await runDetection(text, declaredLanguage, undefined, dependencies)
  const contentSha256 = computeContentSha256(text)

  await write(sql`/* detectCommunityLanguage:update */
    UPDATE communities SET
      lingua_rs_detected_language = ${output.linguaRsDetectedLanguage},
      lingua_rs_content_sha256 = ${contentSha256},
      lingua_rs_input_sha256 = ${detectionKey},
      lingua_rs_results = ${JSON.stringify(output.results)},
      lingua_rs_detected_at = NOW()
    WHERE id = ${communityId}
      AND name IS NOT DISTINCT FROM ${community.name}
      AND markdown IS NOT DISTINCT FROM ${community.markdown}
      AND default_language IS NOT DISTINCT FROM ${community.default_language}
  `)
}
