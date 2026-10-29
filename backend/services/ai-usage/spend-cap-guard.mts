import { recordSpendCapBreach } from '@modules/on-error'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import { getDailyAiCostTotalMicrounits } from './daily-total.mts'
import { getSpendCapFields, spendCapConfig } from './spend-cap-config.mts'

type SpendCapBreach = {
  reason: 'cap_exceeded'
  totalMicrounits: number
  dailyCapMicrounits: number
  day: string
}

/**
 * Thrown by a provider-call boundary (`callRecordingModelUsage`, the free-retry attempt
 * hooks, the structured-decision billing hooks, the community-moderation dry run) when its
 * immediate pre-call recheck finds a breach, after the job-level pre-dispatch check
 * (processAIAgentWorkerJob, backend/workers/ai-agents/workers/core.mts) already passed. Caught
 * there and converted into the same job.moveToDelayed() defer as the pre-dispatch path.
 */
export class SpendCapBreachError extends Error {
  readonly breach: SpendCapBreach
  readonly status = 429
  readonly statusCode = 429

  constructor(breach: SpendCapBreach) {
    super(formatBreachMessage(breach))
    this.name = 'SpendCapBreachError'
    this.breach = breach
  }
}

export type SpendCapGuardDeps = {
  waitForSpendCapConfig: () => Promise<void>
  getSpendCapFields: typeof getSpendCapFields
  getDailyAiCostTotalMicrounits: typeof getDailyAiCostTotalMicrounits
}

const defaultGuardDeps: SpendCapGuardDeps = {
  waitForSpendCapConfig: () => spendCapConfig.waitForInitialization(),
  getSpendCapFields,
  getDailyAiCostTotalMicrounits,
}

/**
 * The single decision point behind the daily AI spend cap: `null` means dispatch/proceed,
 * a populated result means the caller must not make the provider call. Every call site that can
 * incur billed provider spend (OpenAI or OpenRouter) -- queued or synchronous -- must evaluate
 * this (directly, or via `assertDailySpendCapNotBreached` below) immediately before making the
 * call, so a cap change takes effect everywhere spend can happen. A hardcoded list of call sites
 * here has gone stale twice already; do not restore one -- grep call sites that produce billed
 * provider spend (`createOpenAIResponse` and the structured-decision call entry points) instead
 * of trusting a comment. If `getCurrentUtcDay()` advances during the async config or usage read,
 * evaluation restarts for the new day before any admit-or-block decision.
 */
export async function evaluateSpendCapBreach(
  deps: Partial<SpendCapGuardDeps> = {},
): Promise<SpendCapBreach | null> {
  return evaluateUntilUtcDayStable({ ...defaultGuardDeps, ...deps }, 2)
}

async function evaluateUntilUtcDayStable(
  merged: SpendCapGuardDeps,
  remainingRestarts: number,
): Promise<SpendCapBreach | null> {
  const day = getCurrentUtcDay()
  const result = await evaluateSpendCapBreachForDay(merged, day)
  if (getCurrentUtcDay() === day) return result
  if (remainingRestarts === 0) return null
  return evaluateUntilUtcDayStable(merged, remainingRestarts - 1)
}

async function evaluateSpendCapBreachForDay(
  merged: SpendCapGuardDeps,
  day: string,
): Promise<SpendCapBreach | null> {
  try {
    await merged.waitForSpendCapConfig()
    const spendCap = merged.getSpendCapFields()
    if (
      !spendCap.enabled ||
      !Number.isSafeInteger(spendCap.daily_cap_microunits) ||
      spendCap.daily_cap_microunits < 0
    )
      return null
    const dailyTotal = await merged.getDailyAiCostTotalMicrounits(day)
    const { totalMicrounits } = dailyTotal
    if (dailyTotal.day !== day || !Number.isSafeInteger(totalMicrounits) || totalMicrounits < 0)
      return null
    if (totalMicrounits <= spendCap.daily_cap_microunits) return null
    return {
      reason: 'cap_exceeded',
      totalMicrounits,
      dailyCapMicrounits: spendCap.daily_cap_microunits,
      day,
    }
  } catch {
    // Usage and config are best-effort reporting inputs. An unavailable read cannot stop a call.
    return null
  }
}

export type SpendCapAssertDeps = SpendCapGuardDeps & {
  recordSpendCapBreach: typeof recordSpendCapBreach
}

/**
 * For synchronous, non-queue call sites: evaluates the cap, records a breach alert (the queue
 * worker records its own via `recordSpendCapBreach` directly since it already threads that
 * function through its dependency-injected `deps` for testability), and returns the breach so the
 * caller can reject the request. `callerName` identifies the call site in the alert, analogous to
 * `job.name` in the worker's breach context. `deps` defaults to the real implementations; it exists
 * so tests can inject a fake `recordSpendCapBreach` without mocking `@modules/on-error`
 * (disallowed by the module-mock-boundary policy for non-integration internal modules).
 */
export async function assertDailySpendCapNotBreached(
  callerName: string,
  deps: Partial<SpendCapAssertDeps> = {},
): Promise<SpendCapBreach | null> {
  const record = deps.recordSpendCapBreach ?? recordSpendCapBreach
  const breach = await evaluateSpendCapBreach(deps)
  if (!breach) return null
  record({
    agentJobName: callerName,
    dailyTotalMicrounits: breach.totalMicrounits,
    dailyCapMicrounits: breach.dailyCapMicrounits,
    reason: breach.reason,
  })
  return breach
}

function formatBreachMessage(breach: SpendCapBreach): string {
  return `AI spend cap breached (${breach.reason}): ${breach.totalMicrounits} > ${breach.dailyCapMicrounits} microunits for ${breach.day}`
}
