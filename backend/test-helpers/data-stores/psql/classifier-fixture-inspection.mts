import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

export function buildClassifierFixtureInspection(data: ClassifierFixtureData) {
  return {
    async getActivationLifecycleFacts() {
      const { rows } = await read<{
        classifier_retained_activation: boolean
        prompt_retained_activation: boolean
      }>(sql`/* getClassifierFixtureActivationLifecycleFacts */
        SELECT
          (SELECT activated_at IS NOT NULL AND deactivated_at >= activated_at
            FROM classifiers WHERE id = ${data.classifierId}) AS classifier_retained_activation,
          (SELECT activated_at IS NOT NULL AND deactivated_at >= activated_at
            FROM classifier_prompt_versions WHERE id = ${data.promptVersionId}) AS prompt_retained_activation
      `)
      return rows[0]!
    },
    async getTopicResultThreshold(batchId: string) {
      const { rows } = await read<{
        threshold_id: string | null
        effective_lower_threshold: string
        effective_upper_threshold: string
      }>(sql`/* getClassifierFixtureTopicResultThreshold */
        SELECT threshold_id, effective_lower_threshold::text, effective_upper_threshold::text
        FROM topic_classifier_results
        WHERE batch_id = ${batchId}`)
      return rows[0]!
    },
    async getLineageCounts(options: {
      batchId: string
      callId: string
      candidateId?: string | null
    }) {
      const { rows } = await read<{
        batches: number
        calls: number
        candidates: number
        results: number
      }>(sql`/* getClassifierFixtureLineageCounts */
        SELECT
          (SELECT count(*)::integer FROM classifier_decision_batches WHERE id = ${options.batchId}) AS batches,
          (SELECT count(*)::integer FROM classifier_decision_calls WHERE id = ${options.callId}) AS calls,
          (SELECT count(*)::integer FROM classifier_candidates
            WHERE id = ${
              options.candidateId === undefined ? data.topicCandidateId : options.candidateId
            }) AS candidates,
          (SELECT count(*)::integer FROM topic_classifier_results
            WHERE batch_id = ${options.batchId}) AS results`)
      return rows[0]!
    },
    async getDecisionPersistenceFacts(batchId: string) {
      const { rows } = await read<{
        batches: number
        calls: number
        snapshots: number
        topic_results: number
        story_results: number
      }>(sql`/* getClassifierFixtureDecisionPersistenceFacts */
        SELECT
          (SELECT count(*)::integer FROM classifier_decision_batches
            WHERE id = ${batchId}) AS batches,
          (SELECT count(*)::integer FROM classifier_decision_calls
            WHERE batch_id = ${batchId}) AS calls,
          (SELECT count(*)::integer FROM classifier_decision_batch_candidates
            WHERE batch_id = ${batchId}) AS snapshots,
          (SELECT count(*)::integer FROM topic_classifier_results
            WHERE batch_id = ${batchId}) AS topic_results,
          (SELECT count(*)::integer FROM story_classifier_results
            WHERE batch_id = ${batchId}) AS story_results
      `)
      return rows[0]!
    },
    async getPartitionFacts() {
      const { rows } = await read<{
        parent: string
        child: string
        strategy: string
        bound: string
      }>(sql`
        /* getClassifierFixturePartitionFacts */
        SELECT parent.relname AS parent, child.relname AS child,
          pg_get_partkeydef(parent.oid) AS strategy,
          pg_get_expr(child.relpartbound, child.oid) AS bound
        FROM pg_inherits
        JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
        JOIN pg_class child ON child.oid = pg_inherits.inhrelid
        WHERE parent.relname IN (
          'classifier_decision_batch_candidates',
          'topic_classifier_results',
          'story_classifier_results'
        )
        ORDER BY parent.relname, child.relname
      `)
      return rows
    },
  }
}
