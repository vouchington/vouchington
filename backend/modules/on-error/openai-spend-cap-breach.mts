import Sentry from './sentry.mts'

// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Mirrors the identical pattern in index.mts and the other named recorders in this module — kept
// local to avoid changing the export surface of on-error/index.mts.
function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}

const spendCapBreachThrottleMs = 60_000
let lastSpendCapBreachReportedAt: number | undefined

export type OpenAiSpendCapBreachContext = {
  agentJobName: string
  dailyTotalMicrounits: number | null
  dailyCapMicrounits: number
  // 'cap_exceeded': the summed total reached the cap. 'unpriced_rows': at least one row in
  // today's window has no pricing-table entry (pricing_status = 'unpriced'), so the summed total
  // is a known undercount and the check fails closed without trusting it — distinct from an
  // actual cap breach so an operator can tell "we hit the cap" from "we can't price today's
  // usage," which need different responses.
  reason: 'cap_exceeded' | 'unpriced_rows' | 'accounting_uncertain'
  uncertaintySource?: 'ledger_write_failed' | 'unknown_billed_attempt' | 'latch_read_failed'
}

/**
 * Record that the daily OpenAI spend cap (`backend/services/ai-usage/spend-cap-config.mts`) was
 * breached and the breaching job was deferred for a bounded recheck via `job.moveToDelayed()`
 * (`backend/workers/ai-agents/workers/core.mts`).
 *
 * Several jobs can independently breach around the same time, so Sentry reporting is throttled to
 * once per minute — console/dev logging stays unthrottled since it is low-volume there.
 */
export function recordOpenAiSpendCapBreach(context: OpenAiSpendCapBreachContext): void {
  if (shouldLogToConsole()) {
    console.warn('[ai-usage] daily OpenAI spend cap breached', context)
  }
  if (!shouldCaptureSentryMessage()) return
  Sentry.captureMessage('openai_spend_cap_breach', {
    level: 'warning',
    tags: {
      reason: 'openai_spend_cap_breach',
      agent_job_name: context.agentJobName,
      breach_reason: context.reason,
      ...(context.uncertaintySource && { uncertainty_source: context.uncertaintySource }),
    },
    extra: {
      dailyTotalMicrounits: context.dailyTotalMicrounits,
      dailyCapMicrounits: context.dailyCapMicrounits,
    },
  })
}

function shouldCaptureSentryMessage(): boolean {
  if (process.env.NODE_ENV === 'test') return true

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
