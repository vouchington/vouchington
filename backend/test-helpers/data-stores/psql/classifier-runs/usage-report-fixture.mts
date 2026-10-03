import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordAiUsage } from '../../../../services/ai-usage/index.mts'
import {
  type ClassifierUsageWindow,
  completeClassifierRun,
  persistClassifierRunOutcomes,
  startClassifierProviderAttempt,
} from '../../../../services/classifier-runs/index.mts'
import { createTestFutureUtcDay } from '../../../data.mts'
import type { PostClassifierExecutionFixture } from '../post-classifier/execution.mts'
import { localOutcomeFor, remoteDecisionFor } from '../post-classifier/outcomes.mts'

/** The window that holds every run a test just reserved, with room for a slow test runner. */
export function windowAroundNow(): ClassifierUsageWindow {
  const now = Date.now()
  return { from: new Date(now - 120_000), to: new Date(now + 60_000) }
}

/** Takes a classifier out of the active catalog, as retiring one does. */
export async function retireClassifier(slug: string): Promise<void> {
  await write(sql`/* retireClassifierForUsageReportTest */
    UPDATE classifiers SET deactivated_at = CURRENT_TIMESTAMP WHERE slug = ${slug}
  `)
}

/** The millisecond a run was reserved, read back out of its UUIDv7 id. */
export function reservedAtMs(runId: string): number {
  return Number.parseInt(runId.replaceAll('-', '').slice(0, 12), 16)
}

/** Reserves `count` provider attempts under the run's lease, as the executor does before each call. */
export async function startProviderAttempts(
  setup: PostClassifierExecutionFixture,
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < count; attempt += 1) {
    const started = await startClassifierProviderAttempt(setup.adapter, {
      lease: setup.lease,
      maxAttempts: 10,
    })
    if (started !== 'started') throw new Error(`Unexpected attempt: ${started}`)
  }
}

type BilledCall = {
  latencyMs: number
  /** What the provider reported in dollars (default 0.002, that is 2000 millionths). */
  cost?: number
  /** A model with no price and no reported cost. */
  unpriced?: boolean
  responseId?: string
}

/**
 * One billed provider response attributed to the run, written the way the classifier clients write
 * it. The row lands on a reserved far-future day: an unpriced row on today's real day would make
 * the daily spend cap fail closed for every other test.
 */
export function recordBilledCall(
  setup: PostClassifierExecutionFixture,
  {
    latencyMs,
    cost = 0.002,
    unpriced = false,
    responseId = `decision-${randomUUID()}`,
  }: BilledCall,
) {
  return recordAiUsage({
    responseId,
    agentSlug: 'post-classifier',
    model: unpriced ? 'unknown-model' : 'typesafe/jev-1.13-20260917',
    serviceTier: 'default',
    usage: unpriced
      ? { input_tokens: 12, output_tokens: 3 }
      : { input_tokens: 12, output_tokens: 3, cost },
    classifierRunId: setup.run.runId,
    latencyMs,
    createdAt: new Date(`${createTestFutureUtcDay()}T12:00:00.000Z`),
  })
}

/** Persists a decision that tags nothing, as a billed answer would, then completes the run. */
export async function completeRunWithoutTags(setup: PostClassifierExecutionFixture): Promise<void> {
  const persisted = await persistClassifierRunOutcomes(setup.adapter, {
    lease: setup.lease,
    local: localOutcomeFor(setup, false),
    remoteDecision: remoteDecisionFor(setup, false),
  })
  if (persisted !== 'persisted') throw new Error(`Unexpected persist: ${persisted}`)
  await completeClassifierRun(setup.adapter, setup.lease)
}
