import { write, type QueryExecutor } from '@data-stores/psql'
import {
  readCompleteClassifierDecision,
  readCompleteClassifierDecisionIfExistsFromPrimary,
} from '@services/classifiers/read-complete-decision'
import sql from 'sql-template-strings'
import { assertPersistedDecisionMatchesRun, hasNoCapturedCandidates } from './run-remote-checks.mts'
import type { ClassifierRunAdapter, ClassifierRunLease, ClassifierRunOutcomes } from './types.mts'

type OutcomeRow = {
  input_sha256: Buffer
  configuration_json: string
  configuration_sha256: Buffer
  shared_actor_id: string
  decision_batch_id: string | null
  outcomes_persisted_at: Date | null
}

function matchesLease<C>(row: OutcomeRow, lease: ClassifierRunLease<C>): boolean {
  return (
    row.input_sha256.equals(lease.inputSha256) &&
    row.configuration_sha256.equals(lease.resolved.configurationSha256) &&
    row.configuration_json === lease.resolved.configurationJson &&
    row.shared_actor_id === lease.resolved.actorId &&
    row.decision_batch_id === lease.decisionBatchId
  )
}

/**
 * Reads the durable outcomes of a run whose outcomes are already persisted, or null when they are
 * not. Without a query the committed decision is read from the primary so a replay sees the
 * transaction that persisted it.
 */
export async function readClassifierRunOutcomes<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  lease: ClassifierRunLease<C>,
  options: { query?: QueryExecutor } = {},
): Promise<ClassifierRunOutcomes<L> | null> {
  const query = options.query ?? write
  const { rows } = await query<OutcomeRow>(sql`/* readClassifierRunOutcomes */
    SELECT input_sha256, configuration_json::text AS configuration_json, configuration_sha256,
      shared_actor_id, decision_batch_id, outcomes_persisted_at
    FROM classifier_runs WHERE id = ${lease.runId}
  `)
  const row = rows[0]
  if (!row?.outcomes_persisted_at || !matchesLease(row, lease)) return null
  const local = adapter.readLocal ? await adapter.readLocal(query, lease.runId) : null
  if (adapter.validateLocal) {
    adapter.validateLocal(lease.resolved.configuration, local ?? undefined)
  }
  if (row.decision_batch_id === null || hasNoCapturedCandidates(lease)) {
    return { local, remoteDecision: null }
  }
  const remoteDecision = options.query
    ? await readCompleteClassifierDecision(options.query, row.decision_batch_id, 'topic')
    : await readCompleteClassifierDecisionIfExistsFromPrimary(row.decision_batch_id, 'topic')
  if (!remoteDecision) throw new Error('classifier run lost its committed remote decision')
  assertPersistedDecisionMatchesRun(lease, remoteDecision)
  return { local, remoteDecision }
}
