import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import type { ClassifierFixtureData } from './classifier-fixture-data.mts'

export function buildClassifierFixtureInspection(data: ClassifierFixtureData) {
  return {
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
    async getPartitionFacts() {
      const { rows } = await read<{ parent: string; child: string; strategy: string }>(sql`
        /* getClassifierFixturePartitionFacts */
        SELECT parent.relname AS parent, child.relname AS child,
          pg_get_partkeydef(parent.oid) AS strategy
        FROM pg_inherits
        JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
        JOIN pg_class child ON child.oid = pg_inherits.inhrelid
        WHERE parent.relname IN ('topic_classifier_results', 'story_classifier_results')
        ORDER BY parent.relname, child.relname
      `)
      return rows
    },
  }
}
