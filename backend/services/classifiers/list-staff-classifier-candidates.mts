import { beginTransaction } from '@data-stores/psql'
import {
  FIRST_PAGE_UUID,
  pageOf,
  THRESHOLD_REVISION_FROM,
  THRESHOLD_REVISION_SELECT,
} from './threshold-revision-sql.mts'
import type {
  ClassifierThresholdRevision,
  StaffClassifierCandidate,
} from './threshold-management-types.mts'

type CandidateRow = Omit<StaffClassifierCandidate, 'active_threshold'>

export type StaffClassifierCandidatesResult =
  | { outcome: 'not_found' }
  | { outcome: 'ok'; results: StaffClassifierCandidate[]; hasNextPage: boolean }

/**
 * One page of a classifier's candidates in one scope (`communityId` null is the global scope) with
 * each candidate's active threshold revision for the active prompt version. Read from the primary
 * in one transaction so a change the staff member just made is visible and the page is consistent.
 */
export async function listStaffClassifierCandidates(options: {
  classifierId: string
  communityId: string | null
  limit: number
  afterId?: string
}): Promise<StaffClassifierCandidatesResult> {
  await using transaction = await beginTransaction()
  const { rowCount } = await transaction(
    `/* listStaffClassifierCandidates:classifier */
    SELECT 1 FROM classifiers WHERE id = $1 AND deleted_at IS NULL`,
    [options.classifierId],
  )
  if (rowCount === 0) return { outcome: 'not_found' }
  const { rows } = await transaction<CandidateRow>(
    `/* listStaffClassifierCandidates */
    SELECT candidate.id, candidate.candidate_kind, candidate.topic_id, candidate.story_id,
      candidate.community_id
    FROM classifier_candidates candidate
    WHERE candidate.classifier_id = $1
      AND candidate.community_id IS NOT DISTINCT FROM $2::uuid
      AND candidate.deleted_at IS NULL
      AND candidate.id > $3::uuid
    ORDER BY candidate.id
    LIMIT $4`,
    [
      options.classifierId,
      options.communityId,
      options.afterId ?? FIRST_PAGE_UUID,
      options.limit + 1,
    ],
  )
  const page = pageOf(rows, options.limit)
  const { rows: revisions } = await transaction<ClassifierThresholdRevision>(
    `/* listStaffClassifierCandidates:thresholds */
    SELECT ${THRESHOLD_REVISION_SELECT}
    FROM ${THRESHOLD_REVISION_FROM}
    WHERE revision.candidate_id = ANY($1::uuid[])
      AND revision.deactivated_at IS NULL
      AND prompt.activated_at IS NOT NULL
      AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL`,
    [page.results.map(candidate => candidate.id)],
  )
  await transaction.commit()
  const activeByCandidate = new Map(revisions.map(revision => [revision.candidate_id, revision]))
  return {
    outcome: 'ok',
    hasNextPage: page.hasNextPage,
    results: page.results.map(candidate => ({
      ...candidate,
      active_threshold: activeByCandidate.get(candidate.id) ?? null,
    })),
  }
}
