import onError from '@modules/on-error'
import { isExpectedCrawlerOperationalError } from '@modules/on-error/expected-crawler-operational-error'
import type { Worker } from 'glide-mq'
import {
  trackQueueWorkerEvent,
  trackQueueWorkerJobProgressEvent,
  trackQueueWorkerJobCompletedEvent,
} from '@services/analytics'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { formatErrorTree } from '@vouchington/utils/error-tree'
import {
  WorkerLogger,
  addWorkerEventListeners as addSharedWorkerEventListeners,
} from '@vouchington/worker-runtime'
import {
  addSqsConsumerEventListeners as addSharedSqsConsumerEventListeners,
  type SqsConsumer,
} from '@vouchington/worker-runtime/sqs'
import { scrubJobData } from './scrub-job-data.mts'

// Verbose per-job logging is dev-only: off on staging and production (deployed), and off under
// vitest ('test'), so 'development' is the only enabled value.
const logger = new WorkerLogger({
  enabled: getDeployEnvironment(process.env) === 'development',
  level: process.env.LOG_LEVEL === 'info' ? 'info' : 'error',
})

export const addWorkerEventListeners = (worker: Worker) =>
  addSharedWorkerEventListeners(worker, {
    onError,
    onWorkerEvent: trackQueueWorkerEvent,
    onJobProgress: trackQueueWorkerJobProgressEvent,
    onJobCompleted: (queueName, jobName, status, durationMs) => {
      // The backend image smoke test greps this line to prove a heartbeat job ran.
      if (status === 'completed' && !logger.isEnabled() && process.env.NODE_ENV === 'test') {
        console.log('job completed: %s (%dms)', jobName, durationMs)
      }
      trackQueueWorkerJobCompletedEvent(queueName, jobName, status, durationMs)
    },
    isExpectedError: isExpectedCrawlerOperationalError,
    scrubJobData,
    formatError: formatErrorTree,
    logger,
  })

export const addSqsConsumerEventListeners = (consumer: SqsConsumer) =>
  addSharedSqsConsumerEventListeners(consumer, {
    onError,
    onEvent: trackQueueWorkerEvent,
    onMessageReceived: (queueName, messageId) =>
      trackQueueWorkerJobProgressEvent(queueName, messageId, 'active'),
    onMessageFinished: trackQueueWorkerJobCompletedEvent,
  })
