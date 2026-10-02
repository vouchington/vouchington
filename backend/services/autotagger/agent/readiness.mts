import type { QueryExecutor } from '@data-stores/psql'
import {
  approvedPostRequestEligibility,
  followsCompletedClassifierRun,
  hasCompletedClassifierRun,
  type ClassifierRunSubject,
  type CurrentClassifierRunInput,
} from '@services/classifier-runs'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql, { type SQLStatement } from 'sql-template-strings'

/**
 * Reservation-time gate: the first stage (C6 `tagging`) has completed and applied its result for
 * the content this run would be keyed on. A first-stage run that is still waiting, was superseded
 * by a content change, or failed terminally (it never completes) leaves the request pending, so
 * the reasoning pass never sees topics the first stage has not yet decided.
 */
export function hasCompletedFirstStage(
  query: QueryExecutor,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
): Promise<boolean> {
  return hasCompletedClassifierRun(query, {
    subject,
    inputSha256: current.inputSha256,
    classifierSlug: TAGGING_CLASSIFIER_SLUG,
  })
}

/**
 * Sweep filter over `request`: the subject is still live at the requested content (the first
 * stage's subject eligibility) and the first stage has completed at exactly that content. The
 * request is written in the first stage's completion transaction, so this holds from the moment it
 * exists; the clause keeps a request for a superseded first-stage result from being dispatched.
 */
export function autotaggerAgentRequestEligibility(): SQLStatement {
  return sql`(`
    .append(approvedPostRequestEligibility())
    .append(sql` OR EXISTS (
      SELECT 1 FROM rss_feed_items item
      WHERE item.id = request.rss_feed_item_id AND item.deleted_at IS NULL
        AND item.bedrock_nova_multimodal_v1_content_sha256 = request.input_sha256
    )) AND `)
    .append(followsCompletedClassifierRun(TAGGING_CLASSIFIER_SLUG))
}
