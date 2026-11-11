import { write, type OwnedTransaction, type QueryExecutor } from '@data-stores/psql'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import sql from 'sql-template-strings'
import type { ActiveCommunityAgentPromptCursor } from './get-active-prompts.mts'

/** Only an explicit live request may reserve a page; settled traversal is terminal until rearmed. */
export async function communityModerationRequestReady(
  query: QueryExecutor,
  postId: string,
  inputSha256: Buffer,
): Promise<boolean> {
  const { rows } = await query(sql`
    /* communityModerationRequestReady */
    SELECT 1 FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE classifier.slug = ${COMMUNITY_MODERATION_CLASSIFIER_SLUG}
      AND request.post_id = ${postId}
      AND request.input_sha256 = ${inputSha256}
      AND request.no_work_at IS NULL
      AND request.stale_at IS NULL
      AND request.community_prompt_completed_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

/** Advances one settled page's request in the same transaction that completes or replays it. */
export async function advanceCommunityModerationRequest(
  query: OwnedTransaction,
  input: {
    runId: string
    postId: string
    inputSha256: Buffer
    nextCursor: ActiveCommunityAgentPromptCursor | null
    pageFlagged: boolean
    newDecision: boolean
  },
): Promise<{ anyFlagged: boolean; hasMore: boolean; hasNewDecision: boolean; advanced: boolean }> {
  const { rows } = await query<{
    has_flagged_community_prompt: boolean
    has_new_community_prompt_decision: boolean
  }>(sql`
    /* advanceCommunityModerationRequest */
    UPDATE classifier_run_requests request
    SET cursor_community_prompt_activated_at = ${input.nextCursor?.activatedAt ?? null}::timestamptz,
      cursor_community_prompt_id = ${input.nextCursor?.id ?? null}::uuid,
      has_flagged_community_prompt = request.has_flagged_community_prompt OR ${input.pageFlagged},
      has_new_community_prompt_decision = request.has_new_community_prompt_decision OR ${input.newDecision},
      community_prompt_completed_at = CASE
        WHEN ${input.nextCursor === null} THEN COALESCE(request.community_prompt_completed_at, clock_timestamp())
        ELSE NULL END,
      run_identity_id = CASE WHEN ${input.nextCursor !== null} THEN NULL ELSE request.run_identity_id END,
      run_settled_at = CASE WHEN ${input.nextCursor !== null} THEN NULL ELSE request.run_settled_at END
    WHERE request.run_identity_id = ${input.runId}
      AND request.input_sha256 = ${input.inputSha256}
      AND request.post_id = ${input.postId}
      AND request.community_prompt_completed_at IS NULL
    RETURNING has_flagged_community_prompt, has_new_community_prompt_decision
  `)
  return {
    anyFlagged: rows[0]?.has_flagged_community_prompt ?? false,
    hasMore: rows.length > 0 && input.nextCursor !== null,
    hasNewDecision: rows[0]?.has_new_community_prompt_decision ?? false,
    advanced: rows.length > 0,
  }
}

/** Reusing an exact completed page must restore traversal state after reapproval. */
export async function replayCompletedCommunityModerationPage(
  query: OwnedTransaction,
  input: {
    runId: string
    postId: string
    inputSha256: Buffer
    nextCursor: ActiveCommunityAgentPromptCursor | null
    decisionBatchId: string | null
  },
): Promise<{ anyFlagged: boolean; hasMore: boolean; hasNewDecision: boolean; advanced: boolean }> {
  let pageFlagged = false
  if (input.decisionBatchId) {
    const { rows } = await query<{ flagged: boolean }>(sql`
      /* replayCompletedCommunityModerationPage:flagged */
      SELECT EXISTS (
        SELECT 1 FROM community_prompt_classifier_results result
        WHERE result.batch_id = ${input.decisionBatchId}
          AND result.probability > result.effective_upper_threshold
        LIMIT 1
      ) AS flagged
    `)
    pageFlagged = rows[0]?.flagged ?? false
  }
  return advanceCommunityModerationRequest(query, { ...input, pageFlagged, newDecision: false })
}

/** A completed page's follow-on is already durable; the queue admission is best effort. */
export async function hasPendingCommunityModerationPage(
  postId: string,
  inputSha256: Buffer,
): Promise<boolean> {
  const { rows } = await write(sql`
    /* hasPendingCommunityModerationPage */
    SELECT 1 FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE classifier.slug = ${COMMUNITY_MODERATION_CLASSIFIER_SLUG}
      AND request.post_id = ${postId}
      AND request.input_sha256 = ${inputSha256}
      AND request.run_settled_at IS NULL
      AND request.no_work_at IS NULL
      AND request.stale_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
