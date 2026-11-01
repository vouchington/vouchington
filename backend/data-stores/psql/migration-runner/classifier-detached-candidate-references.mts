import type { QueryExecutor } from '../types.mts'

const CANDIDATE_REFERENCING_TABLES = [
  'topic_classifier_results',
  'story_classifier_results',
] as const

/** A detached result child has an independent FK copy that would pin the candidate child. */
export async function releaseDetachedCandidateReferences(
  query: QueryExecutor,
  table: string,
  child: string,
) {
  if (!CANDIDATE_REFERENCING_TABLES.some(candidateTable => candidateTable === table)) return
  await query(`/* releaseDetachedCandidateReferences */
    ALTER TABLE ${child} DROP CONSTRAINT fk_${table}__batch_candidate`)
}
