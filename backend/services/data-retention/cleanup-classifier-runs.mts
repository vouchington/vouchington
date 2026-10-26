import type { OwnedTransaction } from '@data-stores/psql'
import { followsCompletedClassifierRun } from '@services/classifier-run-revival'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql from 'sql-template-strings'

export async function deleteOldClassifierRuns(
  query: OwnedTransaction,
  ids: readonly string[],
): Promise<number> {
  const { rows: deletedRuns } = await query<{ id: string }>(sql`/* deleteOldClassifierRuns */
    DELETE FROM classifier_runs run
    WHERE run.id = ANY(${[...ids]}::uuid[])
      AND (run.completed_at IS NOT NULL OR run.superseded_at IS NOT NULL
        OR run.terminal_failed_at IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM classifier_run_candidates candidate WHERE candidate.run_id = run.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM autotagger_agent_run_topics topic WHERE topic.run_id = run.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM post_classifier_local_outcomes outcome WHERE outcome.run_id = run.id
      )
    RETURNING run.id
  `)
  if (deletedRuns.length > 0) {
    // The C7 request can outlive its completed C6 payload. Retire it only when no other current
    // first-stage completion proves readiness; a later new prompt/content can re-arm it.
    await query(
      sql`/* retireFollowOnRequestsWithoutFirstStage */
      WITH affected AS MATERIALIZED (
        SELECT candidate.id
        FROM classifier_run_identities identity
        JOIN classifiers first_classifier ON first_classifier.id = identity.classifier_id
        JOIN classifiers follow_classifier ON follow_classifier.slug = ${AUTOTAGGER_AGENT_SLUG}
        CROSS JOIN LATERAL (
          SELECT post_request.id FROM classifier_run_requests post_request
          WHERE identity.post_id IS NOT NULL
            AND post_request.classifier_id = follow_classifier.id
            AND post_request.post_id = identity.post_id
            AND post_request.input_sha256 = identity.input_sha256
          UNION ALL
          SELECT item_request.id FROM classifier_run_requests item_request
          WHERE identity.rss_feed_item_id IS NOT NULL
            AND item_request.classifier_id = follow_classifier.id
            AND item_request.rss_feed_item_id = identity.rss_feed_item_id
            AND item_request.input_sha256 = identity.input_sha256
        ) candidate
        WHERE identity.id = ANY(${deletedRuns.map(row => row.id)}::uuid[])
          AND first_classifier.slug = ${TAGGING_CLASSIFIER_SLUG}
      )
      UPDATE classifier_run_requests request
      SET stale_at = clock_timestamp()
      WHERE request.id IN (SELECT id FROM affected)
        AND request.run_settled_at IS NULL AND request.no_work_at IS NULL
        AND request.stale_at IS NULL
        AND NOT `.append(followsCompletedClassifierRun(TAGGING_CLASSIFIER_SLUG)),
    )
    await query(sql`/* deleteRetiredPromptlessClassifierIdentities */
      DELETE FROM classifier_run_identities identity
      WHERE identity.id = ANY(${deletedRuns.map(row => row.id)}::uuid[])
        AND identity.prompt_version_id IS NULL`)
  }
  return deletedRuns.length
}
