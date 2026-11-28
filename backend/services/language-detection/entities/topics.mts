import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeLanguageDetectionResults } from '../write-results.mts'
import { computeDetectionKey, runDetection } from '../detect.mts'

export async function detectTopicLanguage(topicId: string): Promise<void> {
  const { rows } = await read<{
    id: string
    name: string
    markdown: string | null
    lingua_rs_input_sha256: Buffer | null
  }>(sql`/* detectTopicLanguage */
    SELECT id, name, markdown, lingua_rs_input_sha256
    FROM topics
    WHERE id = ${topicId}
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL
    LIMIT 1
  `)
  const topic = rows[0]
  if (!topic) return

  const text = [topic.name, topic.markdown].filter(Boolean).join('\n\n')
  const detectionKey = computeDetectionKey(text, null)

  // Skip if input hasn't changed
  if (topic.lingua_rs_input_sha256?.equals(detectionKey)) return

  const output = await runDetection(text, null)

  await writeLanguageDetectionResults({
    table: 'topics',
    rows: [
      {
        id: topicId,
        detectedLanguage: output.linguaRsDetectedLanguage,
        contentSha256: output.contentSha256,
        inputSha256: detectionKey,
        resultsJson: JSON.stringify(output.results),
        name: topic.name,
        markdown: topic.markdown,
      },
    ],
  })
}
