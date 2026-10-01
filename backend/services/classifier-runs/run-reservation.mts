import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { reserveClassifierDecisionBatch } from '@services/classifiers/write-decision-lineage'
import { retainPublicationIdentityBridges } from '@services/post-publication/identity-bridges'
import sql, { type SQLStatement } from 'sql-template-strings'
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
 */
export async function reserveClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  subject: ClassifierRunSubject,
): Promise<ReserveClassifierRunResult> {
  await using query = await beginTransaction()
  const current = await adapter.lockCurrent(query, subject)
  const result = await reserveLockedClassifierRun(adapter, query, subject, current)
  await query.commit()
  return result
}

export async function reserveLockedClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput | null,
): Promise<ReserveClassifierRunResult> {
  if (!current) {
    await settleClassifierRunRequest(query, adapter.slug, subject, { kind: 'stale' })
    return { kind: 'stale' }
  }
  if (adapter.ready && !(await adapter.ready(query, subject))) return { kind: 'not-ready' }
  const resolved = await adapter.resolve(current, query)
  if (!resolved) {
    await settleClassifierRunRequest(query, adapter.slug, subject, {
      kind: 'no-work',
      inputSha256: current.inputSha256,
    })
    return { kind: 'no-work' }
  }
  const run = await insertClassifierRun(adapter.slug, query, subject, current, resolved)
  await settleClassifierRunRequest(query, adapter.slug, subject, {
    kind: 'run',
    runId: run.runId,
    inputSha256: current.inputSha256,
  })
  return { kind: 'reserved', run }
}

async function insertClassifierRun<C>(
  slug: string,
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
): Promise<ReservedClassifierRun> {
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
  if (remote && proposedBatchId && inserted.decision_batch_id === proposedBatchId) {
    const reserved = await reserveClassifierDecisionBatch(query, {
      batchId: proposedBatchId,
      classifierId: remote.classifierId,
      promptVersionId: remote.promptVersionId,
      subject,
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      candidateKind: 'topic',
      storedCandidateIds: remote.candidates.map(candidate => candidate.candidateId),
    })
    if (!reserved) throw new Error('classifier run decision batch reservation was not inserted')
  }
  return {
    runId: inserted.id,
    subject,
    inputSha256: current.inputSha256,
    configurationSha256: resolved.configurationSha256,
    decisionBatchId: inserted.decision_batch_id,
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
