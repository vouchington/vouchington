interface EnqueueErrorContext {
  stage: 'report-judgement' | 'report-integrity'
  reportId?: string
  entityType: string
  entityId: string
}

/**
 * Attaches moderation enqueue context to an error for Sentry capture via onError.
 * Sets err.tags.moderation_enqueue_stage and err.extra with entity/report identifiers.
 * Returns the same error instance so it can be chained:
 * .catch(err => onError(decorateModerationEnqueueError(err, ctx))).
 */
export function decorateModerationEnqueueError(err: Error, ctx: EnqueueErrorContext): Error {
  const extended = err as Error & {
    tags?: Record<string, string | number | boolean>
    extra?: Record<string, unknown>
  }
  extended.tags = { moderation_enqueue_stage: ctx.stage }
  extended.extra = {
    entity_type: ctx.entityType,
    entity_id: ctx.entityId,
    ...(ctx.reportId !== undefined && { report_id: ctx.reportId }),
  }
  return err
}
