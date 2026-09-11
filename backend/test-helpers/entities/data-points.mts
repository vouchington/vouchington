import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { setTestPostClearanceStatus } from './post-clearance.mts'
import type { Money } from '@ts-shared/money'

/**
 * Insert a test data_point post with structured_data fields.
 * Does not fire entity listeners — use createPost() if you need those side effects.
 */
export async function insertTestDataPoint(data: {
  title: string
  slug: string
  createdById: string
  vertical?: 'credit_card' | 'bank_account'
  topicId?: string
  result?: 'approved' | 'denied' | 'pending'
  creditScoreRange?: string
  creditLimit?: Money
}): Promise<string> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const id = uuidv7()
  const vertical = data.vertical ?? 'credit_card'
  const structuredData: Record<string, unknown> = {
    vertical,
    schema_version: 1,
    currency: data.creditLimit?.currency ?? 'usd',
  }
  if (data.topicId) structuredData.topic_ids = [data.topicId]
  if (data.result) structuredData.result = data.result
  if (data.creditScoreRange) structuredData.credit_score_range = data.creditScoreRange
  if (data.creditLimit != null) structuredData.credit_limit = data.creditLimit

  const { rows: postRows } = await write(sql`
    INSERT INTO posts (
      id,
      post_type,
      title,
      markdown,
      created_by_id,
      data_point_vertical,
      structured_data,
      bedrock_nova_multimodal_v1_content_sha256,
      openai_omni_moderation_content_sha256,
      llm_moderation_content_sha256
    )
    VALUES (
      ${id},
      'data_point',
      ${data.title},
      '',
      ${data.createdById},
      ${vertical},
      ${JSON.stringify(structuredData)},
      ${sha256},
      ${sha256},
      ${sha256}
    )
    RETURNING id
  `)
  const postId = postRows[0].id
  await setTestPostClearanceStatus(postId, 'approved', data.createdById)
  await write(sql`
    INSERT INTO post_slugs (post_id, slug)
    VALUES (${postId}, ${data.slug})
  `)
  if (data.topicId) {
    await write(sql`
      INSERT INTO post_data_point_topics (post_id, topic_id, order_index)
      VALUES (${postId}, ${data.topicId}, 0)
      ON CONFLICT (post_id, topic_id) DO NOTHING
    `)
  }
  return postId
}

/**
 * Return the topic_ids linked to a data_point post in post_data_point_topics,
 * ordered by order_index ascending. Useful for asserting sync correctness in tests.
 */
export async function getPostDataPointTopicIds(postId: string): Promise<string[]> {
  const { rows } = await read<{ topic_id: string }>(sql`
    SELECT topic_id
    FROM post_data_point_topics
    WHERE post_id = ${postId}
    ORDER BY order_index ASC
  `)
  return rows.map(r => r.topic_id)
}
