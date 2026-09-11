import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { BackfillReportJudgementsJobData, ReportJudgementJobData } from '../types.mts'

type MissingJudgementEntity = { entityType: string; entityId: string; triggeringReportId: string }

function buildReportJudgementJob(
  entityType: string,
  entityId: string,
  triggeringReportId: string,
  rerunById?: string | null,
  contextHash?: string | null,
): { data: ReportJudgementJobData; opts: JobOptions } {
  return {
    data: {
      entity_type: entityType,
      entity_id: entityId,
      triggering_report_id: triggeringReportId,
      rerun_by_id: rerunById ?? null,
      context_hash: contextHash ?? null,
    } satisfies ReportJudgementJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['report-judgement'],
      // Skip deduplication on manual re-runs so the staff-triggered job is
      // not silently dropped by a pending automatic job with no rerun_by_id.
      ...(rerunById
        ? {}
        : {
            deduplication: {
              id: `report_judgement_${entityType}_${entityId}_${contextHash ?? 'unknown'}`,
              mode: 'simple' as const,
            },
            ordering: {
              key: `report_judgement_${entityType}_${entityId}`,
              concurrency: 1,
            },
          }),
    } satisfies JobOptions,
  }
}

/**
 * Awaitable variant for manual staff-triggered re-runs: propagates enqueue failures so the
 * caller can surface an error instead of falsely reporting the job as queued.
 */
export async function enqueueReportJudgementAndWait(
  entityType: string,
  entityId: string,
  triggeringReportId: string,
  rerunById?: string | null,
  contextHash?: string | null,
): Promise<void> {
  const { data, opts } = buildReportJudgementJob(
    entityType,
    entityId,
    triggeringReportId,
    rerunById,
    contextHash,
  )
  await ai_agents.add('report-judgement', data, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'report-judgement')
}

// Bulk enqueue for backfill dispatcher: one addBulk call per batch, not one per entity.
export const enqueueReportJudgementBatch = createBulkEnqueueFunction<
  MissingJudgementEntity,
  ReportJudgementJobData,
  'report-judgement'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'report-judgement',
  buildJob: (e: MissingJudgementEntity) => {
    // Backfill/batch jobs intentionally share the automatic-job "unknown context"
    // dedupe key per entity; they only seed missing judgements, not stale contexts.
    const { data, opts } = buildReportJudgementJob(
      e.entityType,
      e.entityId,
      e.triggeringReportId,
      null,
      null,
    )
    return { data, opts }
  },
})

const enqueueBackfillReportJudgementsJob = createEnqueueFunction<
  BackfillReportJudgementsJobData,
  'backfill_report_judgements'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'backfill_report_judgements',
})

export function enqueueBackfillReportJudgements(): ReturnType<
  typeof enqueueBackfillReportJudgementsJob
> {
  return enqueueBackfillReportJudgementsJob(
    {},
    {
      priority: 100,
      deduplication: { id: 'backfill_report_judgements', mode: 'throttle', ttl: 3_600_000 },
    },
  )
}
