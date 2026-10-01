import Sentry from './sentry.mts'

// Same console rule as sqs-consumer-config-missing.mts: log when Sentry is disabled
// (development, CI) but not in test mode. Kept local to avoid widening on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

/**
 * Record that a scheduled or reconcile job skipped its run because required configuration (e.g. a
 * bucket env var) is absent, so the job returns normally instead of throwing and being retried on
 * every tick.
 *
 * Expected in local development and other stacks that run the worker without the AWS resource
 * (./dev/tmux starts every worker, but local dev has no SES inbound bucket). In a deployed
 * environment the same gap is a real misconfiguration, which is why the skip is reported rather
 * than silent: the warning below is the detector. Use this only for jobs that have no work without
 * the config; a job created by a real event (an email that arrived) should fail instead.
 */
export function recordScheduledJobConfigMissing(jobName: string, missingEnvVar: string): void {
  if (shouldLogToConsole()) {
    console.warn('[scheduled-job] skipping run, missing required config', {
      jobName,
      missingEnvVar,
    })
  }
  Sentry.captureMessage('scheduled_job_config_missing', {
    level: 'warning',
    tags: { reason: 'scheduled_job_config_missing', jobName, missingEnvVar },
  })
}
