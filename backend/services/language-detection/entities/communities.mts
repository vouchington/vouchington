import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { writeLanguageDetectionResults } from '../write-results.mts'
import { computeDetectionKey, runDetection } from '../detect.mts'

export async function detectCommunityLanguage(communityId: string): Promise<void> {
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

  const output = await runDetection(text, declaredLanguage)

  await writeLanguageDetectionResults({
    table: 'communities',
    rows: [
      {
        id: communityId,
        detectedLanguage: output.linguaRsDetectedLanguage,
        contentSha256: output.contentSha256,
        inputSha256: detectionKey,
        resultsJson: JSON.stringify(output.results),
        name: community.name,
        markdown: community.markdown,
        defaultLanguage: community.default_language,
      },
    ],
  })
}
