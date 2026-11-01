import Sentry from './sentry.mts'
import { shouldLogToConsole } from './should-log-to-console.mts'

const spendCapBreachThrottleMs = 60_000
let lastSpendCapBreachReportedAt: number | undefined

type SpendCapBreachContext = {
  agentJobName: string
  dailyTotalMicrounits: number
  dailyCapMicrounits: number
  reason: 'cap_exceeded'
}

/**
 * Record that the daily AI spend cap (`backend/services/ai-usage/spend-cap-config.mts`) was
 * breached and the breaching job was deferred for a bounded recheck via `job.moveToDelayed()`
 * (`backend/workers/ai-agents/workers/core.mts`).
 *
 * Several jobs can independently breach around the same time, so Sentry reporting is throttled to
 * once per minute — console/dev logging stays unthrottled since it is low-volume there.
 */
export function recordSpendCapBreach(context: SpendCapBreachContext): void {
  if (shouldLogToConsole()) {
    console.warn('[ai-usage] daily AI spend cap breached', context)
  }
  if (!shouldCaptureSentryMessage()) return
  Sentry.captureMessage('ai_spend_cap_breach', {
    level: 'warning',
    tags: {
      reason: 'ai_spend_cap_breach',
      agent_job_name: context.agentJobName,
      breach_reason: context.reason,
    },
    extra: {
      dailyTotalMicrounits: context.dailyTotalMicrounits,
      dailyCapMicrounits: context.dailyCapMicrounits,
    },
  })
}

function shouldCaptureSentryMessage(): boolean {
  const now = Date.now()
  if (
    lastSpendCapBreachReportedAt !== undefined &&
    now - lastSpendCapBreachReportedAt < spendCapBreachThrottleMs
  ) {
    return false
  }
  lastSpendCapBreachReportedAt = now
  return true
}
