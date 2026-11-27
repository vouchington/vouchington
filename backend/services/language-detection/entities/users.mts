import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeLanguageDetectionResults } from '../write-results.mts'
import { computeDetectionKey, runDetection } from '../detect.mts'

export async function detectUserLanguage(userId: string): Promise<void> {
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
  const detectionKey = computeDetectionKey(text, null)

  // Skip if input hasn't changed
  if (user.lingua_rs_input_sha256?.equals(detectionKey)) return

  // Users have no declared language for their bio
  const output = await runDetection(text, null)

  await writeLanguageDetectionResults({
    table: 'users',
    rows: [
      {
        id: userId,
        detectedLanguage: output.linguaRsDetectedLanguage,
        contentSha256: output.contentSha256,
        inputSha256: detectionKey,
        resultsJson: JSON.stringify(output.results),
        markdown: user.markdown,
      },
    ],
  })
}
