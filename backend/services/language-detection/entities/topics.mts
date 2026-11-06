import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { computeContentSha256, computeDetectionKey, runDetection } from '../detect.mts'
import { invalidate } from '@services/entity-cache/invalidate'

export async function detectTopicLanguage(topicId: string): Promise<void> {
  const { rows } = await read<{
    id: string
    name: string
    markdown: string
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
  const contentSha256 = computeContentSha256(text)
  const detectionKey = computeDetectionKey(text, null)

  // Skip if input hasn't changed
  if (topic.lingua_rs_input_sha256 != null) {
    const existing = topic.lingua_rs_input_sha256
    if (existing.equals(detectionKey)) return
  }

  const output = await runDetection(text, null)

  await write(sql`/* detectTopicLanguage:update */
    UPDATE topics SET
      lingua_rs_detected_language = ${output.linguaRsDetectedLanguage},
      lingua_rs_content_sha256 = ${contentSha256},
      lingua_rs_input_sha256 = ${detectionKey},
      lingua_rs_results = ${JSON.stringify(output.results)},
      lingua_rs_detected_at = NOW()
    WHERE id = ${topicId}
      AND name IS NOT DISTINCT FROM ${topic.name}
      AND markdown IS NOT DISTINCT FROM ${topic.markdown}
  `)
  return invalidate.topics(topicId)
}
