import type { JobOptions } from 'glide-mq'
import type { SchedulerTemplateJobOptions } from './types.mts'

/**
 * Adapts job options shared with a manual-trigger enqueue to a scheduler template. The scheduler
 * tick never applies `delay`, `deduplication`, `parent` or `jobId`, and glide-mq rejects them at
 * `upsertJobScheduler`, so they are dropped here instead of being declared on the template.
 */
export function toSchedulerTemplateOptions(opts: JobOptions): SchedulerTemplateJobOptions {
  const {
    delay: _delay,
    deduplication: _deduplication,
    parent: _parent,
    jobId: _jobId,
    ...templateOptions
  } = opts
  return templateOptions
}
