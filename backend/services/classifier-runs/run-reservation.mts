import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import {
  insertClassifierRunCandidates,
  insertClassifierRunStoryCandidates,
} from './run-candidates.mts'
import {
  PREPARE_AGAIN,
  attemptWithPreparedCandidates,
  captureRunCandidates,
  type PreparedClassifierCandidates,
} from './run-capture.mts'
import { settleClassifierRunRequest } from './run-requests.mts'
import { insertClassifierRun } from './run-create.mts'
import type {
  ClassifierRunAdapter,
  ClassifierRunSubject,
  CurrentClassifierRunInput,
} from './types.mts'

export type ReservedClassifierRun = {
  runId: string
  subject: ClassifierRunSubject
  inputSha256: Buffer
  configurationSha256: Buffer
  decisionBatchId: string | null
}

export type ReserveClassifierRunResult =
  | { kind: 'reserved'; run: ReservedClassifierRun }
  | { kind: 'no-work' | 'stale' | 'not-ready' }

/**
 * Persists the run intent before its job is enqueued and settles the subject's request in the same
 * transaction. The receipt snapshot is the only configuration a later worker may claim, so a
 * changed candidate set, retry or replay can never create a second receipt for the same identity.
 *
 * A new receipt's candidates are chosen before the subject lock is taken, so the vector search and
 * its lookups never hold the lock. The locked transaction keeps only what correctness needs: the
 * current content and configuration are re-read, and the prepared candidates are used only when
 * both still match. When the subject changed meanwhile it prepares again, a bounded number of times.
 */
export async function reserveClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
): Promise<ReserveClassifierRunResult> {
  return attemptWithPreparedCandidates(
    adapter,
    subject,
    prepared => reserveOnce(adapter, subject, prepared),
    { kind: 'not-ready' },
  )
}

async function reserveOnce<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
  prepared: PreparedClassifierCandidates | null,
): Promise<ReserveClassifierRunResult | typeof PREPARE_AGAIN> {
  await using query = await beginTransaction()
  const result = await lockAndReserve(adapter, query, subject, prepared)
  if (result !== PREPARE_AGAIN) await query.commit()
  return result
}

async function lockAndReserve<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
  prepared: PreparedClassifierCandidates | null,
): Promise<ReserveClassifierRunResult | typeof PREPARE_AGAIN> {
  const current = await adapter.lockCurrent(query, subject)
  return reserveLockedClassifierRun(adapter, query, subject, current, prepared)
}

/** The locked reservation, or a request to prepare again because the subject changed under it. */
export async function reserveLockedClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput | null,
  prepared: PreparedClassifierCandidates | null,
): Promise<ReserveClassifierRunResult | typeof PREPARE_AGAIN> {
  if (!current) {
    await settleClassifierRunRequest(query, adapter.slug, subject, { kind: 'stale' })
    return { kind: 'stale' }
  }
  if (adapter.ready && !(await adapter.ready(query, subject, current))) {
    return { kind: 'not-ready' }
  }
  const resolved = await adapter.resolve(subject, current, query)
  const captured = resolved
    ? await captureRunCandidates(adapter, query, subject, current, resolved, prepared)
    : null
  if (captured === PREPARE_AGAIN) return PREPARE_AGAIN
  if (!resolved || !captured) {
    await settleClassifierRunRequest(query, adapter.slug, subject, {
      kind: 'no-work',
      inputSha256: current.inputSha256,
    })
    return { kind: 'no-work' }
  }
  const { inserted, retired, ...run } = await insertClassifierRun(
    query,
    adapter.slug,
    subject,
    current,
    resolved,
  )
  if (retired) {
    await settleClassifierRunRequest(query, adapter.slug, subject, {
      kind: 'run',
      runId: run.runId,
      inputSha256: current.inputSha256,
    })
    return { kind: 'no-work' }
  }
  if (inserted && captured.topicIds.length > 0) {
    await insertClassifierRunCandidates(query, run.runId, captured.topicIds)
  }
  if (inserted && captured.storyCandidates.length > 0) {
    await insertClassifierRunStoryCandidates(query, run.runId, captured.storyCandidates)
  }
  await settleClassifierRunRequest(query, adapter.slug, subject, {
    kind: 'run',
    runId: run.runId,
    inputSha256: current.inputSha256,
  })
  return { kind: 'reserved', run }
}
