import { write } from '@data-stores/psql'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import { LEGAL_REMOVAL_TAG } from '@services/entity-cache/legal-removal'
import {
  userDeletionErrorMessage,
  runWithUserDeletionAttemptHeartbeat,
} from '@services/user-deletions'
import sql from 'sql-template-strings'
import {
  enqueueReconcileNotificationsForPostCategoryVotes,
  getTopicIdsForPostCategoryVotes,
} from './enqueue-reconcile-post-topic-notifications.mts'
import { hasTopHashtagVoteTarget } from './top-hashtag-vote-targets.mts'
import { mapRelationImpactRow } from './relation-impact-targets.mts'
import {
  executeUserDeletionExternalWork,
  type PendingExternalWork,
} from './delete-external-work-dispatch.mts'

export async function processUserDeletionExternalWork(
  requestId: string,
  processingAttemptId: string,
): Promise<{ hasMore: boolean }> {
  const work = await getPendingExternalWork(requestId)
  if (!work) return { hasMore: false }
  try {
    await runWithUserDeletionAttemptHeartbeat(requestId, processingAttemptId, () =>
      executeUserDeletionExternalWork(work, requestId, processEntityRelationEffects),
    )
  } catch (err) {
    await recordExternalWorkFailure(work.id, requestId, processingAttemptId, err)
    throw err
  }
  if (!(await completeExternalWork(work.id, requestId, processingAttemptId))) {
    throw new Error('User deletion attempt lost ownership before completing external work')
  }
  return { hasMore: true }
}

async function processEntityRelationEffects(requestId: string, impactId: string): Promise<void> {
  const { rows } = await write<{ subject_id: string }>(sql`/* processEntityRelationEffects:impact */
    SELECT subject_id, relation__post__category__topic_alias_id, relation__post__category__topic_id,
      relation__post__related__post_id, relation__post__related__url_id,
      relation__rss_feed_item__category__topic_alias_id, relation__rss_feed_item__category__topic_id,
      relation__topic__category__topic_id, relation__topic__faq__post_id, relation__topic__faq__url_id,
      relation__topic__guide__url_id, relation__topic__landing_page__url_id,
      relation__topic__publisher_type__topic_id, relation__topic__related__post_id,
      relation__topic__related__topic_id, relation__topic__related__url_id,
      relation__topic__terms_of_service__url_id, relation__user__category__topic_id
    FROM user_deletion_relation_impacts
    WHERE request_id = ${requestId} AND id = ${impactId}`)
  const impact = rows[0]
  if (!impact) throw new Error('Missing user deletion relation impact for pending effects')
  const target = mapRelationImpactRow(impact)
  const topicIds = await runPrimaryEntityRelationEffects(target)
  await runEntityRelationTopicEffects(target, topicIds)
}

async function runPrimaryEntityRelationEffects(target: {
  relationTable: string
  subjectId: string
  entityRelationId: string
}): Promise<string[]> {
  await invalidate.entity_relation_elections({
    entityRelationId: target.entityRelationId,
    relationTable: target.relationTable,
  })
  await enqueueReconcileNotificationsForPostCategoryVotes([target])
  return getTopicIdsForPostCategoryVotes([target])
}

async function runEntityRelationTopicEffects(
  target: { relationTable: string; subjectId: string; entityRelationId: string },
  topicIds: string[],
): Promise<void> {
  if (topicIds.length > 0) await invalidate.topic_metrics(...topicIds)
  if (hasTopHashtagVoteTarget([target])) await enqueueRefreshTopHashtags()
}

async function getPendingExternalWork(requestId: string) {
  const { rows } = await write(sql`/* processUserDeletionExternalWork:candidate */
    SELECT work.id, work.work_kind, work.work_key, work.relation_impact_id,
      lineage.provider_account_id AS stripe_customer_id
    FROM user_deletion_external_works work
    LEFT JOIN membership_provider_lineages lineage ON lineage.id = work.membership_provider_lineage_id
    WHERE work.request_id = ${requestId} AND work.completed_at IS NULL
      AND (
        work.work_kind <> 'cloudflare-cache-tag' OR work.work_key <> ${LEGAL_REMOVAL_TAG}
        OR NOT EXISTS (
          SELECT 1 FROM user_deletion_external_works sibling
          WHERE sibling.request_id = work.request_id AND sibling.completed_at IS NULL
            AND sibling.id <> work.id
        )
      )
    ORDER BY work.id LIMIT 1`)
  return rows[0] as PendingExternalWork | undefined
}

async function completeExternalWork(
  workId: string,
  requestId: string,
  processingAttemptId: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* processUserDeletionExternalWork:complete */
    UPDATE user_deletion_external_works work SET completed_at = CURRENT_TIMESTAMP,
      last_error_message = NULL FROM user_deletion_requests request
    WHERE work.id = ${workId} AND work.completed_at IS NULL
      AND request.id = work.request_id AND request.id = ${requestId}
      AND request.processing_attempt_id = ${processingAttemptId}
      AND request.processing_started_at IS NOT NULL AND request.completed_at IS NULL`)
  return (rowCount ?? 0) > 0
}

async function recordExternalWorkFailure(
  workId: string,
  requestId: string,
  processingAttemptId: string,
  error: unknown,
): Promise<void> {
  await write(sql`/* processUserDeletionExternalWork:failure */
    UPDATE user_deletion_external_works work
    SET last_error_message = ${userDeletionErrorMessage(error)}
    FROM user_deletion_requests request
    WHERE work.id = ${workId} AND work.completed_at IS NULL
      AND request.id = work.request_id AND request.id = ${requestId}
      AND request.processing_attempt_id = ${processingAttemptId}
      AND request.processing_started_at IS NOT NULL AND request.completed_at IS NULL`)
}
