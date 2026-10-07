import {
  read,
  beginTransaction,
  registerPostCommitAction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import onError from '@modules/on-error'
import type { ModerationReport } from './config.mts'
import { decorateModerationEnqueueError } from './enqueue-observability.mts'
import { enqueueReportIntegrityCheck } from './integrity.mts'
import type { CreateModerationReportInput } from './parse.mts'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { getPrivateUserByAny } from '@services/users'
import {
  currentUserCanReportVisiblePost,
  type ReportablePostAccessInput,
} from './reportable-post-access.mts'
import { insertModerationReport } from './create-insert.mts'
import { getPolicySeverity } from '@ts-shared/utils/moderation-policy'
import { createCriticalModerationAlertNotification } from '@services/notifications/create-critical-moderation-alert-notification'

// The canonical review queue is unresolved `moderation_reports` rows.
// Admin tooling reads directly from that table — there is no separate queue worker.

// Mirrors @services/posts/check-privacy-access; this package does not depend on @services/posts.
const REPORT_BLOCKED_POST_TYPES = new Set(['topic_recommendation'])

type ReportablePostTargetRow = ReportablePostAccessInput & {
  target_created_by_id: string | null
}

export interface CreateModerationReportResult {
  report: ModerationReport
  isDuplicate: boolean
}

/**
 * Files a report and opens its case in one transaction. Joins `queryOptions.query` when supplied;
 * otherwise owns the transaction. Alerts and checks follow the owning commit.
 */
export async function createModerationReport(
  currentUserId: string,
  provenance: ContentProvenance,
  input: CreateModerationReportInput,
  queryOptions?: QueryOptions,
): Promise<CreateModerationReportResult> {
  await assertReportableEntity(currentUserId, input)

  const run = async (query: TransactionQuery) => {
    const result = await insertModerationReport(currentUserId, provenance, input, query)
    registerPostCommitAction(query, async () => notify(result.report))
    return result
  }
  if (queryOptions?.query) return withTransactionOptions(queryOptions, run)
  await using query = await beginTransaction()
  const result = await run(query)
  await query.commit()
  return result

  function notify(report: ModerationReport): void {
    // N2: alert staff immediately for critical-severity reports (e.g. illegal_content)
    if (getPolicySeverity(input.reason) === 'critical') {
      void createCriticalModerationAlertNotification(report.id).catch(onError)
    }

    // Fire-and-forget: keep AI judgement guidance aligned with the current report set.
    enqueueReportJudgementIfContextChanged(report.id, input.entityType, input.entityId)

    // Fire-and-forget: enqueue a mass-report-abuse check for this entity.
    // Debounce deduplication collapses rapid reports into a single check job.
    enqueueReportIntegrityCheck(input.entityType, input.entityId)
  }
}

async function assertReportableEntity(
  currentUserId: string,
  input: CreateModerationReportInput,
): Promise<void> {
  if (input.entityType === 'rss_feed_item') {
    const item = await getRssFeedItemById(input.entityId)
    assert(item, 404, 'Reportable entity not found')
    return
  }

  if (input.entityType === 'post' || input.entityType === 'comment') {
    await assertReportablePost(currentUserId, input)
    return
  }

  const { rows } = await read(sql`/* assertReportableEntity */
    SELECT
      CASE
        WHEN ${input.entityType} = 'user' THEN (
          SELECT id FROM users WHERE id = ${input.entityId} AND deleted_at IS NULL LIMIT 1
        )
        WHEN ${input.entityType} = 'url_hostname' THEN (
          SELECT id FROM url_hostnames WHERE id = ${input.entityId} AND is_blocked IS NOT TRUE LIMIT 1
        )
      END AS owner_id
  `)
  const ownerId = (rows[0] as { owner_id?: string | null } | undefined)?.owner_id
  assert(ownerId, 404, 'Reportable entity not found')
  assert(ownerId !== currentUserId, 422, 'Cannot report yourself')
}

async function assertReportablePost(
  currentUserId: string,
  input: CreateModerationReportInput,
): Promise<void> {
  const query = sql`/* assertReportablePost */
    SELECT
      target_post.id,
      target_post.created_by_id AS target_created_by_id,
      visibility_post.created_by_id,
      visibility_post.broadcast,
      visibility_post.privacy,
      visibility_post.clearance_status,
      visibility_post.community_id
    FROM posts target_post
    JOIN view_posts visibility_post
      ON visibility_post.id = COALESCE(target_post.root_post_id, target_post.id)
    WHERE target_post.id = ${input.entityId}
      AND target_post.post_type `
  query.append(input.entityType === 'comment' ? sql`= 'comment'` : sql`!= 'comment'`)
  query.append(sql`
      AND visibility_post.post_type::text != ALL(${[...REPORT_BLOCKED_POST_TYPES]}::text[])
      AND target_post.deleted_at IS NULL
    LIMIT 1
  `)
  const { rows } = await read<ReportablePostTargetRow>(query)
  const post = rows[0]
  assert(post, 404, 'Reportable entity not found')
  assert(post.target_created_by_id !== currentUserId, 422, 'Cannot report yourself')

  const currentUser = await getPrivateUserByAny(currentUserId)
  assert(currentUser, 404, 'Reportable entity not found')
  assert(
    await currentUserCanReportVisiblePost(currentUser, post),
    404,
    'Reportable entity not found',
  )
}

function enqueueReportJudgementIfContextChanged(
  reportId: string,
  entityType: string,
  entityId: string,
): void {
  // Refresh only when the report context changed enough to affect judgement guidance.
  import('@services/moderation-reports/judgement-refresh')
    .then(async ({ shouldRefreshReportJudgementForEntity }) => {
      const { refresh, context } = await shouldRefreshReportJudgementForEntity(
        entityType as import('./config.mts').ModerationReportEntityType,
        entityId,
      )
      if (!refresh) return
      const { enqueueReportJudgementAndWait } =
        await import('@queues/ai-agents/enqueues/report-judgement')
      await enqueueReportJudgementAndWait(entityType, entityId, reportId, null, context.contextHash)
    })
    /* v8 ignore start -- fire-and-forget error handler; covered by process-level onError integration */
    .catch((err: Error) =>
      onError(
        decorateModerationEnqueueError(err, {
          stage: 'report-judgement',
          reportId,
          entityType,
          entityId,
        }),
      ),
    )
  /* v8 ignore stop */
}
