import { type QueryOptions, type TransactionQuery } from '@data-stores/psql'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { lockPostPublication } from '@services/post-publication'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import { ensureCurrentPostModerationVersion } from './moderation-ledger.mts'
import { recordPostClearancePublicationChange } from './publication-change.mts'
import { CLEARANCE_CHANGE_TYPES } from './status-constants.mts'
import { runPostClearanceTransaction } from './status-transaction.mts'
import type { ClearanceStatus } from './types.mts'

export interface ClearanceDecisionContext {
  reasonCode?: string
  privateNote?: string
  platformOverride?: boolean
}

export interface ClearanceCompensationMetadata extends Record<string, unknown> {
  reason: string
  compensates_change_id: string
  restores_change_id: string | null
}

export async function setPostClearanceStatus(
  postId: string,
  status: ClearanceStatus,
  updatedById?: string | null,
  options?: QueryOptions,
  metadata: Record<string, unknown> = {},
  decision: ClearanceDecisionContext = {},
): Promise<{ id: string; community_id: string | null } | null> {
  return writePostClearanceStatus(postId, status, updatedById, options, metadata, decision, false)
}

export async function restorePostClearanceStatus(
  postId: string,
  status: ClearanceStatus,
  changedById: string | null,
  options: QueryOptions,
  metadata: ClearanceCompensationMetadata,
  decision: ClearanceDecisionContext = {},
): Promise<{ id: string; community_id: string | null } | null> {
  return writePostClearanceStatus(postId, status, changedById, options, metadata, decision, true)
}

async function writePostClearanceStatus(
  postId: string,
  status: ClearanceStatus,
  updatedById: string | null | undefined,
  options: QueryOptions | undefined,
  metadata: Record<string, unknown>,
  decision: ClearanceDecisionContext,
  isCompensation: boolean,
): Promise<{ id: string; community_id: string | null } | null> {
  if (decision.platformOverride && !decision.reasonCode) {
    throw new Error('Platform clearance overrides require a reason code')
  }
  if (decision.privateNote && !decision.platformOverride) {
    throw new Error('Private clearance notes are only allowed on platform overrides')
  }
  const changeType = CLEARANCE_CHANGE_TYPES[status]
  const transactionOptions = options ?? {}
  const run = async (query: TransactionQuery) => {
    if (decision.platformOverride) {
      await ensureCurrentPostModerationVersion(postId, { query })
    }
    await lockPostPublication(query, postId)
    const { rows } = await query<{ id: string; community_id: string | null }>(
      `/* setPostClearanceStatus */
      WITH inserted_change AS (
        INSERT INTO post_clearance_changes (
          post_id, change_type, changed_by_id, public_reason_code, private_note,
          platform_override, metadata, moderation_transparency_categories
        )
        SELECT p.id, $2::post_clearance_change_types, $3, $6, $7, $8, $5::jsonb,
          CASE WHEN $9 IS NOT TRUE
              AND $2::post_clearance_change_types = 'reject' AND actor.username = $4
            THEN ARRAY['post_clearance_reject']::text[] ELSE '{}'::text[] END
        FROM posts p
        LEFT JOIN users actor ON actor.id = $3
        WHERE p.id = $1
        RETURNING id, post_id, change_type, created_at
      ),
      staff_disposition AS (
        INSERT INTO post_moderation_dispositions (
          version_id, source, disposition, reason_code, evidence, actor_user_id
        )
        SELECT version.id, 'staff'::post_moderation_sources,
          CASE inserted_change.change_type
            WHEN 'approve' THEN 'pass'::post_moderation_disposition_types
            WHEN 'reject' THEN 'reject'::post_moderation_disposition_types
            ELSE 'review'::post_moderation_disposition_types
          END,
          $6, jsonb_build_object('platform_override', true), $3
        FROM inserted_change
        JOIN posts post ON post.id = inserted_change.post_id
        JOIN post_moderation_versions version
          ON version.post_id = post.id
         AND version.content_sha256 = post.llm_moderation_content_sha256
        WHERE $8 IS TRUE
          AND $9 IS NOT TRUE
          AND $3 IS NOT NULL
          AND inserted_change.change_type <> 'reset_to_pending'
        RETURNING id
      )
      UPDATE posts
      SET latest_clearance_change_id = inserted_change.id,
        approved_at = CASE WHEN inserted_change.change_type = 'approve'
          THEN inserted_change.created_at ELSE NULL END,
        rejected_at = CASE WHEN inserted_change.change_type = 'reject'
          THEN inserted_change.created_at ELSE NULL END,
        in_review_at = CASE WHEN inserted_change.change_type = 'mark_in_review'
          THEN inserted_change.created_at ELSE NULL END,
        updated_by_id = CASE WHEN $9 IS TRUE THEN updated_by_id
          ELSE COALESCE($3, updated_by_id) END
      FROM inserted_change
      WHERE posts.id = inserted_change.post_id
      RETURNING inserted_change.id, posts.community_id`,
      [
        postId,
        changeType,
        updatedById ?? null,
        MODERATION_SYSTEM_USERNAME,
        JSON.stringify(metadata),
        decision.reasonCode ?? null,
        decision.privateNote ?? null,
        decision.platformOverride ?? false,
        isCompensation,
      ],
    )
    const change = rows[0] ?? null
    if (change) await recordPostClearancePublicationChange(query, postId, change.community_id)
    return change
  }
  const change = await runPostClearanceTransaction(transactionOptions, run)
  if (change && !transactionOptions.query && !transactionOptions.client)
    void enqueueRefreshTopHashtags()
  return change
}
