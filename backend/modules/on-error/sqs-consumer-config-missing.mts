import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts, valkey-saturation.mts, and
// worker-queue-topology-skew.mts — kept local to avoid changing the export surface of
// on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

/**
 * Record that an SQS consumer's required configuration (e.g. a queue URL env var) is absent, so
 * its SqsConsumerDefinition.load() returns null and loadSqsConsumers() proceeds without it,
 * rather than crash-looping the whole worker-io/worker-cpu process over one unconfigured
 * consumer.
 *
 * Expected in local development, where AWS-backed SQS consumers are unconditionally selected by
 * ./dev/tmux's generated QUEUES list but have no local queue URL by default. In a deployed
 * environment the same gap is a real misconfiguration; the queue's own *_queue_age CloudWatch
 * alarm (vouchington-infra/opentofu/monitoring.tf) is the durable detector for "nothing is reading this queue" if
 * this message is missed.
 */
export function recordSqsConsumerConfigMissing(queueName: string, missingEnvVar: string): void {
  if (shouldLogToConsole()) {
    console.warn('[sqs-consumer] skipping consumer, missing required config', {
      queueName,
      missingEnvVar,
    })
  }
  Sentry.captureMessage('sqs_consumer_config_missing', {
    level: 'warning',
    tags: { reason: 'sqs_consumer_config_missing', queueName, missingEnvVar },
  })
}
