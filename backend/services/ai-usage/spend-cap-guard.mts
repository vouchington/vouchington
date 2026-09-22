import { recordOpenAiSpendCapBreach } from '@modules/on-error'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import {
  getAccountingUncertaintySource,
  type AccountingUncertaintySource,
} from './accounting-uncertainty.mts'
import { getDailyAiCostTotalMicrounits } from './daily-total.mts'
import { getOpenAiSpendCapFields, openAiSpendCapConfig } from './spend-cap-config.mts'

type OpenAiSpendCapBreachBase = {
  dailyCapMicrounits: number
  day: string
}

export type OpenAiSpendCapBreach =
  | (OpenAiSpendCapBreachBase & {
      reason: 'cap_exceeded' | 'unpriced_rows'
      totalMicrounits: number
    })
  | (OpenAiSpendCapBreachBase & {
      reason: 'accounting_uncertain'
      totalMicrounits: null
      uncertaintySource: AccountingUncertaintySource | 'latch_read_failed'
    })

/**
 * Thrown by a tool loop (backend/agents/_shared/run-tool-loop*.mts) when a per-iteration cap
 * recheck finds a breach mid-loop, after the job-level pre-dispatch check
 * (processAIAgentWorkerJob, backend/workers/ai-agents/workers/core.mts) already passed. Caught
 * there and converted into the same job.moveToDelayed() defer as the pre-dispatch path.
 */
export class OpenAiSpendCapBreachError extends Error {
  readonly breach: OpenAiSpendCapBreach
  readonly status = 429
  readonly statusCode = 429
  readonly expose = true

  constructor(breach: OpenAiSpendCapBreach) {
    super(formatBreachMessage(breach))
    this.name = 'OpenAiSpendCapBreachError'
    this.breach = breach
  }
}

export type OpenAiSpendCapGuardDeps = {
  waitForOpenAiSpendCapConfig: () => Promise<void>
  getOpenAiSpendCapFields: typeof getOpenAiSpendCapFields
  getDailyAiCostTotalMicrounits: typeof getDailyAiCostTotalMicrounits
  getAccountingUncertaintySource: typeof getAccountingUncertaintySource
}

const defaultGuardDeps: OpenAiSpendCapGuardDeps = {
  waitForOpenAiSpendCapConfig: () => openAiSpendCapConfig.waitForInitialization(),
  getOpenAiSpendCapFields,
  getDailyAiCostTotalMicrounits,
  getAccountingUncertaintySource,
}

/**
 * The single decision point behind the daily OpenAI spend cap: `null` means dispatch/proceed,
 * a populated result means the caller must not make the OpenAI call. Every call site that can
 * incur billed OpenAI spend -- queued or synchronous -- must evaluate this (directly, or via
 * `assertOpenAiSpendCapNotBreached` below) immediately before making the call, so a cap change
 * takes effect everywhere spend can happen. A hardcoded list of call sites here has gone stale
 * twice already; do not restore one -- grep call sites that produce billed OpenAI spend
 * (`createOpenAIResponse`, `callOpenAIModeration`, agent `runToolLoop`/single-call entry points)
 * instead of trusting a comment. If `getCurrentUtcDay()` advances during the async config, latch,
 * or ledger reads, evaluation restarts for the new day before any admit-or-block decision.
 */
export async function evaluateOpenAiSpendCapBreach(
  deps: Partial<OpenAiSpendCapGuardDeps> = {},
): Promise<OpenAiSpendCapBreach | null> {
  return evaluateUntilUtcDayStable({ ...defaultGuardDeps, ...deps }, 2)
}

async function evaluateUntilUtcDayStable(
  merged: OpenAiSpendCapGuardDeps,
  remainingRestarts: number,
): Promise<OpenAiSpendCapBreach | null> {
  const day = getCurrentUtcDay()
  const result = await evaluateOpenAiSpendCapBreachForDay(merged, day)
  if (getCurrentUtcDay() === day || remainingRestarts === 0) return result
  return evaluateUntilUtcDayStable(merged, remainingRestarts - 1)
}

async function evaluateOpenAiSpendCapBreachForDay(
  merged: OpenAiSpendCapGuardDeps,
  day: string,
): Promise<OpenAiSpendCapBreach | null> {
  await merged.waitForOpenAiSpendCapConfig()
  const spendCap = merged.getOpenAiSpendCapFields()
  if (!spendCap.enabled) return null
  let uncertaintySource: AccountingUncertaintySource | 'latch_read_failed' | null
  try {
    uncertaintySource = await merged.getAccountingUncertaintySource(day)
  } catch {
    uncertaintySource = 'latch_read_failed'
  }
  if (uncertaintySource) {
    return {
      reason: 'accounting_uncertain',
      totalMicrounits: null,
      dailyCapMicrounits: spendCap.daily_cap_microunits,
      day,
      uncertaintySource,
    }
  }
  const dailyTotal = await merged.getDailyAiCostTotalMicrounits(day)
  const { totalMicrounits, hasUnpricedRows } = dailyTotal
  if (!hasUnpricedRows && totalMicrounits < spendCap.daily_cap_microunits) return null
  return {
    reason: hasUnpricedRows ? 'unpriced_rows' : 'cap_exceeded',
    totalMicrounits,
    dailyCapMicrounits: spendCap.daily_cap_microunits,
    day,
  }
}

export type OpenAiSpendCapAssertDeps = OpenAiSpendCapGuardDeps & {
  recordOpenAiSpendCapBreach: typeof recordOpenAiSpendCapBreach
}

/**
 * For synchronous, non-queue call sites: evaluates the cap, records a breach alert (the queue
 * worker records its own via `recordOpenAiSpendCapBreach` directly since it already threads that
 * function through its dependency-injected `deps` for testability), and returns the breach so the
 * caller can reject the request. `callerName` identifies the call site in the alert, analogous to
 * `job.name` in the worker's breach context. `deps` defaults to the real implementations; it exists
 * so tests can inject a fake `recordOpenAiSpendCapBreach` without mocking `@modules/on-error`
 * (disallowed by the module-mock-boundary policy for non-integration internal modules).
 */
export async function assertOpenAiSpendCapNotBreached(
  callerName: string,
  deps: Partial<OpenAiSpendCapAssertDeps> = {},
): Promise<OpenAiSpendCapBreach | null> {
  const record = deps.recordOpenAiSpendCapBreach ?? recordOpenAiSpendCapBreach
  const breach = await evaluateOpenAiSpendCapBreach(deps)
  if (!breach) return null
  record({
    agentJobName: callerName,
    dailyTotalMicrounits: breach.totalMicrounits,
    dailyCapMicrounits: breach.dailyCapMicrounits,
    reason: breach.reason,
    ...(breach.reason === 'accounting_uncertain' && {
      uncertaintySource: breach.uncertaintySource,
    }),
  })
  return breach
}

function formatBreachMessage(breach: OpenAiSpendCapBreach): string {
  if (breach.reason === 'accounting_uncertain') {
    return `OpenAI spend accounting is uncertain (${breach.uncertaintySource}) for ${breach.day}`
  }
  return `OpenAI spend cap breached (${breach.reason}): ${breach.totalMicrounits} >= ${breach.dailyCapMicrounits} microunits for ${breach.day}`
}
