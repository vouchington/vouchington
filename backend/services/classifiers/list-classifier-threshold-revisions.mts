import { write } from '@data-stores/psql'
import {
  FIRST_NEWEST_PAGE_UUID,
  pageOf,
  THRESHOLD_REVISION_FROM,
  THRESHOLD_REVISION_SELECT,
} from './threshold-revision-sql.mts'
import type { ClassifierThresholdRevision } from './threshold-management-types.mts'

export type ClassifierThresholdRevisionsResult =
  | { outcome: 'not_found' }
  | { outcome: 'ok'; results: ClassifierThresholdRevision[]; hasNextPage: boolean }

/**
 * A candidate's threshold history, newest revision first, across every prompt version. The
 * `classifier_id` filter makes a candidate id that belongs to another classifier a not-found.
 * Read from the primary so a staff member sees the revision they just wrote.
 */
export async function listClassifierThresholdRevisions(options: {
  classifierId: string
  candidateId: string
  limit: number
  beforeId?: string
}): Promise<ClassifierThresholdRevisionsResult> {
  const { rows } = await write<ClassifierThresholdRevision>(
    `/* listClassifierThresholdRevisions */
    SELECT ${THRESHOLD_REVISION_SELECT}
    FROM ${THRESHOLD_REVISION_FROM}
    WHERE revision.candidate_id = $2
      AND revision.classifier_id = $1
      AND revision.id < $3::uuid
    ORDER BY revision.id DESC
    LIMIT $4`,
    [
      options.classifierId,
      options.candidateId,
      options.beforeId ?? FIRST_NEWEST_PAGE_UUID,
      options.limit + 1,
    ],
  )
  if (rows.length > 0) return { outcome: 'ok', ...pageOf(rows, options.limit) }
  // An empty page is either a history exhausted by the cursor or no such candidate.
  const { rowCount } = await write(
    `/* listClassifierThresholdRevisions:candidate */
    SELECT 1 FROM classifier_candidates
    WHERE id = $1 AND classifier_id = $2 AND deleted_at IS NULL`,
    [options.candidateId, options.classifierId],
  )
  return rowCount === 0
    ? { outcome: 'not_found' }
    : { outcome: 'ok', results: [], hasNextPage: false }
}
