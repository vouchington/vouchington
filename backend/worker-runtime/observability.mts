import onError from '@modules/on-error'
import { isExpectedCrawlerOperationalError } from '@modules/on-error/expected-crawler-operational-error'
import type { Worker, Job } from 'glide-mq'
import {
  trackQueueWorkerEvent,
  trackQueueWorkerJobProgressEvent,
  trackQueueWorkerJobCompletedEvent,
} from '@services/analytics'
import { WorkerLogger } from './logger.mts'
import { scrubJobData } from './scrub-job-data.mts'
import type { SqsConsumer, SqsMessage } from './sqs-consumer.mts'

const logger = new WorkerLogger()

export const addWorkerEventListeners = (worker: Worker) => {
  // Worker-level events
  worker.on('error', onError)
  worker.on('drained', () => trackQueueWorkerEvent(worker.name, 'drained'))
  worker.on('closed', () => trackQueueWorkerEvent(worker.name, 'closed'))
  worker.on('closing', () => trackQueueWorkerEvent(worker.name, 'closing'))
  worker.on('ready', () => trackQueueWorkerEvent(worker.name, 'ready'))

  // Job progress events
  worker.on('active', (job: Job) => {
    logger.onActive(worker.name, job)
    trackQueueWorkerJobProgressEvent(worker.name, job.name, 'active')
  })
  worker.on('stalled', (jobId: string) =>
    trackQueueWorkerJobProgressEvent(worker.name, jobId, 'stalled'),
  )
  worker.on('progress', (job: Job) =>
    trackQueueWorkerJobProgressEvent(worker.name, job.name, 'progress'),
  )

  // Job completed events
  worker.on('failed', (job: Job | undefined, error: Error) => onFailed(worker, job, error))
  worker.on('completed', (job: Job) => onCompleted(worker, job))
}

// SQS consumer events are genuinely different from glide-mq's (no job queue, no retries, no
// concurrency setting) — this listens to sqs-consumer.mts's own event vocabulary directly rather
// than shimming it onto addWorkerEventListeners.
export const addSqsConsumerEventListeners = (consumer: SqsConsumer) => {
  const startTimes = new Map<string, bigint>()

  consumer.on('closing', () => trackQueueWorkerEvent(consumer.name, 'closing'))
  consumer.on('closed', () => trackQueueWorkerEvent(consumer.name, 'closed'))

  consumer.on('poll-error', (error: unknown) => onSqsConsumerError(consumer.name, error))

  consumer.on('message-received', (message: SqsMessage) => {
    startTimes.set(message.messageId, process.hrtime.bigint())
    trackQueueWorkerJobProgressEvent(consumer.name, message.messageId, 'active')
  })

  consumer.on('message-deleted', (message: SqsMessage) => {
    trackQueueWorkerJobCompletedEvent(
      consumer.name,
      message.messageId,
      'completed',
      takeElapsedMs(startTimes, message.messageId),
    )
  })

  consumer.on('message-failed', (message: SqsMessage, error: unknown) => {
    trackQueueWorkerJobCompletedEvent(
      consumer.name,
      message.messageId,
      'failed',
      takeElapsedMs(startTimes, message.messageId),
    )
    onSqsConsumerError(consumer.name, error, message.messageId)
  })

  // The handler itself already succeeded here; only the delete call failed. The message survives
  // to be redelivered (and re-handled) once its visibility timeout elapses.
  consumer.on('message-delete-failed', (message: SqsMessage, error: unknown) => {
    takeElapsedMs(startTimes, message.messageId)
    onSqsConsumerError(consumer.name, error, message.messageId)
  })
}

function takeElapsedMs(startTimes: Map<string, bigint>, messageId: string): number {
  const startTime = startTimes.get(messageId)
  startTimes.delete(messageId)
  return startTime === undefined ? 0 : Number(process.hrtime.bigint() - startTime) / 1_000_000
}

function onSqsConsumerError(queueName: string, error: unknown, messageId?: string): void {
  const err = error instanceof Error ? error : new Error(String(error))
  const extErr = err as Error & { tags?: Record<string, string | number | boolean> }
  extErr.tags = {
    ...extErr.tags,
    queue: queueName,
    ...(messageId != null && { message_id: messageId }),
  }
  onError(err)
}

function onFailed(worker: Worker, job: Job | undefined, error: Error) {
  if (job) {
    const jobData = scrubJobData(job.data)
    if (!isExpectedCrawlerOperationalError(error)) {
      if (logger.isEnabled()) {
        logger.onFailed(worker.name, job, error)
      } else {
        console.error(
          'job failed: %s %o (%dms) %s',
          job.name,
          {
            queue: worker.name,
            job_id: job.id ?? 'unknown',
            ...(jobData && { job_data: jobData }),
          },
          getDuration(job),
          error,
        )
      }
    }
    trackQueueWorkerJobCompletedEvent(worker.name, job.name, 'failed', getDuration(job))

    // Attach job context so Sentry receives queue/job metadata via onError's tag passthrough.
    // Job data values are scrubbed: PII/secret-shaped keys and unstructured free text are
    // redacted, while enum-like scalars, UUID/ULID ids, booleans, and numbers pass through.
    const extErr = error as Error & {
      tags?: Record<string, string | number | boolean>
      extra?: Record<string, unknown>
    }
    extErr.tags = {
      ...extErr.tags,
      queue: worker.name,
      job_name: job.name,
      ...(job.id != null && { job_id: job.id }),
    }
    extErr.extra = {
      ...extErr.extra,
      job_name: job.name,
      ...(job.opts?.attempts != null && { attempts: job.opts.attempts }),
      ...(jobData && { job_data: jobData }),
    }
  }
  onError(error)
}

function onCompleted(worker: Worker, job: Job) {
  if (logger.isEnabled()) {
    logger.onCompleted(worker.name, job)
  } else if (process.env.NODE_ENV === 'test') {
    console.log('job completed: %s (%dms)', job.name, getDuration(job))
  }
  trackQueueWorkerJobCompletedEvent(worker.name, job.name, 'completed', getDuration(job))
}

function getDuration(job: Job) {
  return job.processedOn && job.finishedOn
    ? job.finishedOn - job.processedOn
    : (job.finishedOn || Date.now()) - (job.processedOn || Date.now())
}
