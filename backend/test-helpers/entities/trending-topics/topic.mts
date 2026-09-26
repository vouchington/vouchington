import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function insertTopicWithTimestamp(
  userId: string,
  random: string,
  timestampMs: number,
) {
  const id = uuidv7({ msecs: timestampMs })
  const sha256 = `\\x${'0'.repeat(64)}`
  const name = `Trending Topic ${random}`
  const slug = `trending-topic-${random}`
  await write(sql`
    INSERT INTO topics (id, name, slug, created_by_id, topic_type, bedrock_nova_multimodal_v1_content_sha256, created_via)
    VALUES (${id}, ${name}, ${slug}, ${userId}, 'topic', ${sha256}, 'system')
  `)
  await write(
    sql`INSERT INTO topic_metrics (topic_id) VALUES (${id}) ON CONFLICT (topic_id) DO NOTHING`,
  )
  return id
}
