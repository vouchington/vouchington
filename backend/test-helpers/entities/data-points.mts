import { beginTransaction, write, read } from '@data-stores/psql'
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
  hardInquiries12m?: number | null
  cardsOpened24m?: number | null
}): Promise<string> {
  const sha256 = `\\x${'0'.repeat(64)}`
  const id = uuidv7()
  const vertical = data.vertical ?? 'credit_card'
  const result = data.result ?? 'approved'
  const currency = data.creditLimit?.currency ?? 'usd'
  const creditScoreRange =
    vertical === 'credit_card'
      ? (data.creditScoreRange ?? '670-739')
      : (data.creditScoreRange ?? null)
  const creditScorePresence = creditScoreRange === null ? 'absent' : 'present'
  await using transaction = await beginTransaction()
  const { rows: postRows } = await transaction(sql`
    /* insertTestDataPoint */
    INSERT INTO posts (
      id,
      post_type,
      title,
      markdown,
      created_by_id,
      data_point_vertical,
      bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256
    )
    VALUES (
      ${id},
      'data_point',
      ${data.title},
      '',
      ${data.createdById},
      ${vertical},
      ${sha256},
      ${sha256}
    )
    RETURNING id
  `)
  const postId = postRows[0].id
  await transaction(sql`
    /* insertTestDataPoint */
    INSERT INTO post_data_point_facts (
      post_id, vertical, schema_version, result, currency,
      credit_score_range, credit_score_range_presence,
      hard_inquiries_12m, hard_inquiries_12m_presence,
      cards_opened_24m, cards_opened_24m_presence,
      credit_limit_amount, credit_limit_currency, credit_limit_presence
    ) VALUES (
      ${postId},
      ${vertical},
      1,
      ${result},
      ${currency},
      ${creditScoreRange},
      ${creditScorePresence},
      ${optionalCount(data.hardInquiries12m)},
      ${countPresence(data.hardInquiries12m)},
      ${optionalCount(data.cardsOpened24m)},
      ${countPresence(data.cardsOpened24m)},
      ${data.creditLimit?.amount ?? null},
      ${data.creditLimit ? currency : null},
      ${data.creditLimit ? 'present' : 'absent'}
    )
  `)
  await transaction(sql`
    /* insertTestDataPoint */
    INSERT INTO post_slugs (post_id, slug)
    VALUES (${postId}, ${data.slug})
  `)
  if (data.topicId) {
    await transaction(sql`
      /* insertTestDataPoint */
      INSERT INTO post_data_point_topics (post_id, topic_id, order_index)
      VALUES (${postId}, ${data.topicId}, 0)
      ON CONFLICT (post_id, topic_id) DO NOTHING
    `)
  }
  await transaction.commit()
  await setTestPostClearanceStatus(postId, 'approved', data.createdById)
  return postId
}

/**
 * Return the topic_ids linked to a data_point post in post_data_point_topics,
 * ordered by order_index ascending. Useful for asserting sync correctness in tests.
 */
export async function dataPointFactConstraintCode(
  sqlText: string,
  values: unknown[],
): Promise<string> {
  try {
    await write(sqlText, values)
    return 'ok'
  } catch (error) {
    const code = (error as { code?: string }).code
    return code ?? 'error'
  }
}

export async function readStoredDataPointCounts(postId: string): Promise<{
  hardInquiries12m: number | null
  cardsOpened24m: number | null
}> {
  const { rows } = await read<{
    hard_inquiries_12m: string | null
    cards_opened_24m: string | null
  }>(sql`
    /* readStoredDataPointCounts */
    SELECT hard_inquiries_12m::text AS hard_inquiries_12m,
           cards_opened_24m::text AS cards_opened_24m
    FROM post_data_point_facts
    WHERE post_id = ${postId}
  `)
  const row = rows[0]
  if (!row) throw new Error(`missing data point facts for ${postId}`)
  return {
    hardInquiries12m: storedCount(row.hard_inquiries_12m),
    cardsOpened24m: storedCount(row.cards_opened_24m),
  }
}

function optionalCount(value: number | null | undefined): number | null {
  if (value === undefined) return null
  return value
}

function countPresence(value: number | null | undefined): 'absent' | 'null' | 'present' {
  if (value === undefined) return 'absent'
  if (value === null) return 'null'
  return 'present'
}

function storedCount(value: string | null): number | null {
  if (value === null) return null
  return Number(value)
}

export async function getPostDataPointTopicIds(postId: string): Promise<string[]> {
  const { rows } = await read<{ topic_id: string }>(sql`
    SELECT topic_id
    FROM post_data_point_topics
    WHERE post_id = ${postId}
    ORDER BY order_index ASC
  `)
  return rows.map(r => r.topic_id)
}
