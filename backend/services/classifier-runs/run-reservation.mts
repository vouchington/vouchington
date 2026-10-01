import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { reserveClassifierDecisionBatch } from '@services/classifiers/write-decision-lineage'
import { retainPublicationIdentityBridges } from '@services/post-publication/identity-bridges'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  insertClassifierRunCandidates,
  insertClassifierRunStoryCandidates,
} from './run-candidates.mts'
import { pinnedStoredCandidateIds } from './remote-plan.mts'
import {
  PREPARE_AGAIN,
  attemptWithPreparedCandidates,
  captureRunCandidates,
  type PreparedClassifierCandidates,
} from './run-capture.mts'
import { settleClassifierRunRequest } from './run-requests.mts'
import type {
  ClassifierRunAdapter,
  ClassifierRunSubject,
  CurrentClassifierRunInput,
  ResolvedClassifierRun,
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
  if (adapter.ready && !(await adapter.ready(query, subject))) return { kind: 'not-ready' }
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
  const { inserted, ...run } = await insertClassifierRun(
    query,
    adapter.slug,
    subject,
    current,
    resolved,
  )
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

async function insertClassifierRun<C>(
  query: OwnedTransaction,
  slug: string,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
): Promise<ReservedClassifierRun & { inserted: boolean }> {
  if (current.communityId) {
    await retainPublicationIdentityBridges(query, 'community', [current.communityId])
  }
  const remote = resolved.remote
  const proposedBatchId = remote ? await generateBatchId(query) : null
  const conflict: SQLStatement =
    subject.postId !== null
      ? sql`(classifier_id, post_id, input_sha256, configuration_sha256) WHERE post_id IS NOT NULL`
      : sql`(classifier_id, rss_feed_item_id, input_sha256, configuration_sha256)
        WHERE rss_feed_item_id IS NOT NULL`
  const { rows } = await query<{ id: string; decision_batch_id: string | null }>(
    sql`/* reserveClassifierRun.insert */
    INSERT INTO classifier_runs (
      classifier_id, post_id, rss_feed_item_id, input_sha256, configuration_json,
      configuration_sha256, shared_actor_id, decision_batch_id
    ) VALUES (
      (SELECT id FROM classifiers WHERE slug = ${slug}), ${subject.postId}, ${subject.rssFeedItemId},
      ${current.inputSha256}, ${resolved.configurationJson}::jsonb, ${resolved.configurationSha256},
      ${resolved.actorId}, ${proposedBatchId}
    ) ON CONFLICT `
      .append(conflict)
      .append(' DO UPDATE SET superseded_at = NULL RETURNING id, decision_batch_id'),
  )
  const inserted = rows[0]
  if (!inserted) throw new Error('classifier run reservation did not return a receipt')
  const isNew =
    remote !== null && proposedBatchId !== null && inserted.decision_batch_id === proposedBatchId
  if (remote && isNew) {
    const reserved = await reserveClassifierDecisionBatch(query, {
      batchId: proposedBatchId,
      classifierId: remote.classifierId,
      promptVersionId: remote.promptVersionId,
      subject,
      scope: remote.scope,
      candidateKind: remote.candidateKind,
      storedCandidateIds: pinnedStoredCandidateIds(remote),
    })
    if (!reserved) throw new Error('classifier run decision batch reservation was not inserted')
  }
  return {
    runId: inserted.id,
    subject,
    inputSha256: current.inputSha256,
    configurationSha256: resolved.configurationSha256,
    decisionBatchId: inserted.decision_batch_id,
    inserted: isNew,
  }
}

async function generateBatchId(query: OwnedTransaction): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* generateClassifierRunBatchId */
    SELECT uuidv7() AS id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('classifier run decision batch ID was not generated')
  return id
}
