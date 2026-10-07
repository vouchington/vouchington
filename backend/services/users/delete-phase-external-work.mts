import { write } from '@data-stores/psql'
import { sanitizeStripeCustomer } from '@modules/stripe/customers'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { deleteExportFromS3 } from '@services/account-data-requests'
import { invalidate } from '@services/entity-cache/invalidate'
import { purgeCacheTags } from '@services/entity-cache/purge'
import {
  userDeletionErrorMessage,
  runWithUserDeletionAttemptHeartbeat,
  type UserDeletionExternalWorkKind,
} from '@services/user-deletions'
import sql from 'sql-template-strings'
import {
  enqueueReconcileNotificationsForPostCategoryVotes,
  getTopicIdsForPostCategoryVotes,
} from './enqueue-reconcile-post-topic-notifications.mts'
import { hasTopHashtagVoteTarget } from './top-hashtag-vote-targets.mts'
import { mapRelationImpactRow } from './relation-impact-targets.mts'

type ExternalWorkDependencies = {
  deleteExportFromS3: (s3Key: string) => Promise<unknown>
  purgeCacheTags: (tags: readonly string[]) => Promise<unknown>
  sanitizeStripeCustomer: (
    stripeCustomerId: string,
    deps?: Parameters<typeof sanitizeStripeCustomer>[1],
    idempotencyKey?: string,
  ) => Promise<unknown>
}

export async function processUserDeletionExternalWork(
  requestId: string,
  processingAttemptId: string,
  dependencies: Partial<ExternalWorkDependencies> = {},
): Promise<{ hasMore: boolean }> {
  const work = await getPendingExternalWork(requestId)
  if (!work) return { hasMore: false }
  const deps = { deleteExportFromS3, purgeCacheTags, sanitizeStripeCustomer, ...dependencies }
  try {
    await runWithUserDeletionAttemptHeartbeat(requestId, processingAttemptId, async () => {
      if (work.work_kind === 'cloudflare-cache-tag') {
        await deps.purgeCacheTags([work.work_key])
      } else if (work.work_kind === 's3-export') {
        await deps.deleteExportFromS3(work.work_key)
      } else if (work.work_kind === 'stripe-customer') {
        try {
          await deps.sanitizeStripeCustomer(
            work.work_key,
            undefined,
            `user-deletion__${requestId}__stripe__${work.work_key}`,
          )
        } catch (err) {
          if (!isStripeMissingCustomerError(err)) throw err
        }
      } else if (work.work_kind === 'entity-relation-effects') {
        await processEntityRelationEffects(requestId, work.relation_impact_id)
      } else {
        throw new Error(`Unsupported user deletion external work kind: ${work.work_kind}`)
      }
    })
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
    SELECT id, work_kind, work_key, relation_impact_id FROM user_deletion_external_works
    WHERE request_id = ${requestId} AND completed_at IS NULL ORDER BY id LIMIT 1`)
  return rows[0] as
    | (
        | {
            id: string
            work_kind: 'entity-relation-effects'
            work_key: null
            relation_impact_id: string
          }
        | {
            id: string
            work_kind: Exclude<UserDeletionExternalWorkKind, 'entity-relation-effects'>
            work_key: string
            relation_impact_id: null
          }
      )
    | undefined
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

function isStripeMissingCustomerError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'resource_missing' &&
    'param' in error &&
    error.param === 'id'
  )
}
