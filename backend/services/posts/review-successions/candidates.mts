import type { TransactionQuery } from '@data-stores/psql/types'
import {
  buildOtherwisePublicPostEligibilityFilter,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { lockPostPublicationPostScopes } from '@services/post-publication'
import sql from 'sql-template-strings'
import type { ReviewSuccessionCandidate, ReviewSuccessionGroup } from './types.mts'

type CandidateRow = {
  author_user_id: string
  topic_ids: string[]
  id: string
  archived_at: Date | null
  is_public: boolean
  is_otherwise_public: boolean
  succession_id: string | null
  succession_topic_ids: string[] | null
}

export const REVIEW_SUCCESSION_CANDIDATE_PAGE_SIZE = 100

/** Locks every current candidate once, after all affected exact-topic groups are locked. */
export async function lockReviewSuccessionCandidates(
  query: TransactionQuery,
  groups: readonly ReviewSuccessionGroup[],
): Promise<void> {
  const candidateIds = await listReviewSuccessionCandidateIds(query, groups)
  await lockPostPublicationPostScopes(query, candidateIds)
  if (candidateIds.length === 0) return
  await query(
    `/* lockReviewSuccessionCandidateRows */
    SELECT id FROM posts
    WHERE id = ANY($1::uuid[])
    ORDER BY id
    FOR UPDATE`,
    [candidateIds],
  )
}

/** Reads all groups in one statement, including active archive epochs that may be restored. */
export async function listLockedReviewSuccessionCandidates(
  query: TransactionQuery,
  groups: readonly ReviewSuccessionGroup[],
): Promise<ReviewSuccessionCandidate[]> {
  const statement = sql`/* listLockedReviewSuccessionCandidates */ WITH `
  statement.append(reviewSuccessionCandidatePageCte(groups)).append(sql`
    SELECT grouped.author_user_id, grouped.topic_ids, candidate.id, candidate.archived_at,
      (`)
  statement
    .append(buildPublicPostEligibilityFilter('candidate', 'root'))
    .append(sql`) AS is_public, (`)
    .append(buildOtherwisePublicPostEligibilityFilter('candidate', 'root'))
    .append(sql`) AS is_otherwise_public,
      succession.id AS succession_id,
      succession.topic_ids AS succession_topic_ids
    FROM group_reviews grouped
    JOIN posts candidate ON candidate.id = grouped.id
    JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
    LEFT JOIN review_successions succession
      ON succession.predecessor_post_id = candidate.id
      AND succession.predecessor_archived_at = candidate.archived_at
      AND succession.automatically_restored_at IS NULL
      AND succession.manual_override_at IS NULL
    ORDER BY grouped.author_user_id, grouped.topic_ids, candidate.id`)
  const { rows } = await query<CandidateRow>(statement)
  return rows.map(row => ({
    authorUserId: row.author_user_id,
    topicIds: row.topic_ids,
    id: row.id,
    archivedAt: row.archived_at,
    isPublic: row.is_public,
    isOtherwisePublic: row.is_otherwise_public,
    successionId: row.succession_id,
    successionTopicIds: row.succession_topic_ids,
  }))
}

async function listReviewSuccessionCandidateIds(
  query: TransactionQuery,
  groups: readonly ReviewSuccessionGroup[],
): Promise<string[]> {
  const statement = sql`/* listReviewSuccessionCandidateIds */ WITH `
  statement.append(reviewSuccessionCandidatePageCte(groups)).append(sql`
    SELECT DISTINCT id FROM group_reviews ORDER BY id`)
  const { rows } = await query<{ id: string }>(statement)
  return rows.map(row => row.id)
}

function reviewSuccessionCandidatePageCte(groups: readonly ReviewSuccessionGroup[]) {
  const records = groups.map(group => ({
    author_user_id: group.authorUserId,
    topic_ids: group.topicIds,
  }))
  const statement = sql`groups AS (
    SELECT author_user_id, topic_ids
    FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
      AS input(author_user_id uuid, topic_ids uuid[])
  ), group_reviews AS (
    SELECT group_input.author_user_id, group_input.topic_ids, review.id
    FROM groups group_input
    CROSS JOIN LATERAL (
      SELECT candidate.id
      FROM posts candidate
      JOIN posts candidate_root ON candidate_root.id = COALESCE(candidate.root_id, candidate.id)
      LEFT JOIN review_successions active_succession
        ON active_succession.predecessor_post_id = candidate.id
        AND active_succession.predecessor_archived_at = candidate.archived_at
        AND active_succession.automatically_restored_at IS NULL
        AND active_succession.manual_override_at IS NULL
      WHERE candidate.created_by_id = group_input.author_user_id
        AND candidate.post_type = 'review'
        AND candidate.root_id IS NULL
        AND candidate.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM post_review_topic_ratings anchor_rating
          WHERE anchor_rating.post_id = candidate.id
            AND anchor_rating.topic_id = group_input.topic_ids[1]
        )
        AND (
          SELECT ARRAY_AGG(candidate_rating.topic_id ORDER BY candidate_rating.topic_id)
          FROM post_review_topic_ratings candidate_rating
          WHERE candidate_rating.post_id = candidate.id
        ) = group_input.topic_ids
        AND ((`
  statement
    .append(buildPublicPostEligibilityFilter('candidate', 'candidate_root'))
    .append(sql`) OR (active_succession.id IS NOT NULL AND (`)
    .append(buildOtherwisePublicPostEligibilityFilter('candidate', 'candidate_root'))
    .append(sql`)))
      ORDER BY (`)
    .append(buildPublicPostEligibilityFilter('candidate', 'candidate_root')).append(sql`) DESC,
        candidate.id DESC
      LIMIT ${REVIEW_SUCCESSION_CANDIDATE_PAGE_SIZE}
    ) review
  )`)
  return statement
}
