import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { DISPUTE_SLA_HOURS, type ReviewDisputeStatus } from './config.mts'
import type { ReviewDisputeResponse } from './types.mts'

const DISPUTE_SELECT = sql`
  rd.id, rd.post_id, rd.topic_id, rd.disputant_user_id, rd.reason, rd.claim_text,
  CASE
    WHEN rd.resolved_at IS NULL THEN 'pending'
    WHEN rd.resolution_action = 'dismiss' THEN 'dismissed'
    ELSE 'resolved'
  END AS status,
  rd.recommended_action, rd.ai_public_response, rd.ai_internal_response, rd.model, rd.ai_drafted_at,
  rd.public_response, rd.internal_notes, rd.drafted_at, rd.edited_at, rd.edited_by_id,
  rd.approved_at, rd.approved_by_id, rd.sent_at, rd.resolved_at, rd.resolved_by_id,
  rd.resolution_action, rd.latest_lifecycle_change_id, rd.updated_at,
  uuid_extract_timestamp(rd.id) AS created_at,
  CASE WHEN p.deleted_at IS NULL AND NULLIF(BTRIM(p.title), '') IS NOT NULL THEN jsonb_build_object(
    'text', p.title,
    'declared_language', p.declared_language,
    'lingua_rs_detected_language', p.lingua_rs_detected_language
  ) ELSE NULL END AS post_content,
  jsonb_build_object(
    'disputant', jsonb_build_object(
      'id', rd.disputant_user_id,
      'username', disputant.username,
      'verified_display_name', disputant.verified_display_name,
      'profile_image_id', disputant.profile_image_id
    ),
    'review', jsonb_build_object(
      'post', jsonb_build_object(
        'id', p.id,
        'title', p.title,
        'declared_language', p.declared_language,
        'lingua_rs_detected_language', p.lingua_rs_detected_language,
        'slug', post_slug.slug,
        'markdown_preview', LEFT(p.markdown, 500),
        'created_by_id', p.created_by_id,
        'created_at', p.created_at
      ),
      'topic', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'slug', t.slug,
        'topic_type', t.topic_type
      ) END,
      'rating', rd.disputed_rating
    )
  ) AS staff_context
`

const DISPUTE_JOINS = sql`
  LEFT JOIN view_users_public disputant ON disputant.id = rd.disputant_user_id
  JOIN posts p ON p.id = rd.post_id
  LEFT JOIN topics t
    ON t.id = rd.topic_id
    AND t.deleted_at IS NULL
    AND t.merged_into_topic_id IS NULL
  LEFT JOIN LATERAL (
    SELECT ps.slug
    FROM post_slugs ps
    WHERE ps.post_id = rd.post_id
    ORDER BY ps.created_at DESC
    LIMIT 1
  ) post_slug ON true
`

function addIsOverdue(dispute: ReviewDisputeResponse): ReviewDisputeResponse {
  if (dispute.status !== 'pending') return dispute
  const ageHours = (Date.now() - dispute.created_at.getTime()) / 3_600_000
  return { ...dispute, is_overdue: ageHours > DISPUTE_SLA_HOURS }
}

export async function getReviewDisputeById(id: string): Promise<ReviewDisputeResponse | null> {
  return queryReviewDisputeById(id, read)
}

export async function getReviewDisputeByIdFromPrimary(
  id: string,
): Promise<ReviewDisputeResponse | null> {
  return queryReviewDisputeById(id, write)
}

async function queryReviewDisputeById(
  id: string,
  query: typeof read,
): Promise<ReviewDisputeResponse | null> {
  const { rows } = await query<ReviewDisputeResponse>(
    sql`/* getReviewDisputeById */
    SELECT `
      .append(DISPUTE_SELECT)
      .append(sql`
    FROM review_disputes rd
    `)
      .append(DISPUTE_JOINS).append(sql`
    WHERE rd.id = ${id}
    LIMIT 1
  `),
  )
  const row = rows[0]
  return row ? addIsOverdue(row) : null
}

export async function getReviewDisputeAfterMutation(id: string): Promise<ReviewDisputeResponse> {
  const dispute = await getReviewDisputeByIdFromPrimary(id)
  assert(dispute, 500, 'Dispute disappeared after mutation')
  return dispute
}

export type ListReviewDisputesOptions = {
  status?: ReviewDisputeStatus
  limit?: number
  beforeId?: string | null
  disputantUserId?: string | null
}

export async function listReviewDisputes(
  options: ListReviewDisputesOptions = {},
): Promise<{ disputes: ReviewDisputeResponse[]; hasNextPage: boolean }> {
  const { status = 'pending', limit = 25, beforeId, disputantUserId } = options
  const fetchLimit = limit + 1

  const query = sql`/* listReviewDisputes */
    SELECT `
    .append(DISPUTE_SELECT)
    .append(sql`
    FROM review_disputes rd
    `)
    .append(DISPUTE_JOINS).append(sql`
    WHERE `)
  appendReviewDisputeStatusPredicate(query, status)
  query.append(sql`
  `)
  if (disputantUserId) {
    query.append(sql` AND rd.disputant_user_id = ${disputantUserId}`)
  }
  if (beforeId) {
    query.append(sql` AND rd.id < ${beforeId}`)
  }
  query.append(sql` ORDER BY rd.id DESC LIMIT ${fetchLimit}`)

  const { rows } = await read(query)
  const disputes = (rows as ReviewDisputeResponse[]).map(addIsOverdue)
  const hasNextPage = disputes.length > limit
  return { disputes: disputes.slice(0, limit), hasNextPage }
}

function appendReviewDisputeStatusPredicate(
  query: ReturnType<typeof sql>,
  status: ReviewDisputeStatus,
): void {
  if (status === 'pending') {
    query.append(sql`rd.resolved_at IS NULL`)
  } else if (status === 'dismissed') {
    query.append(sql`rd.resolved_at IS NOT NULL AND rd.resolution_action = 'dismiss'`)
  } else {
    query.append(sql`rd.resolved_at IS NOT NULL AND rd.resolution_action != 'dismiss'`)
  }
}

export async function listDisputesForPost(postId: string): Promise<ReviewDisputeResponse[]> {
  const { rows } = await read(
    sql`/* listDisputesForPost */
    SELECT `
      .append(DISPUTE_SELECT)
      .append(sql`
    FROM review_disputes rd
    `)
      .append(DISPUTE_JOINS).append(sql`
    WHERE rd.post_id = ${postId}
    ORDER BY rd.id DESC
  `),
  )
  return rows as ReviewDisputeResponse[]
}
