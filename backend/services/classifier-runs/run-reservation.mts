import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import { reserveClassifierDecisionBatch } from '@services/classifiers/write-decision-lineage'
import { retainPublicationIdentityBridges } from '@services/post-publication/identity-bridges'
import sql, { type SQLStatement } from 'sql-template-strings'
import { insertClassifierRunCandidates } from './run-candidates.mts'
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
  const resolved = await adapter.resolve(subject, current, query)
  const capturedTopicIds = resolved
    ? await captureRunCandidates(adapter, query, subject, current, resolved)
    : null
  if (!resolved || !capturedTopicIds) {
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
  if (inserted && capturedTopicIds.length > 0) {
    await insertClassifierRunCandidates(query, run.runId, capturedTopicIds)
  }
  await settleClassifierRunRequest(query, adapter.slug, subject, {
    kind: 'run',
    runId: run.runId,
    inputSha256: current.inputSha256,
  })
  return { kind: 'reserved', run }
}

/**
 * The topic candidates a new receipt captures, or null when the classifier finds none. An identity
 * that already has a receipt keeps the set it captured, so the search never runs a second time and
 * a changed result can never change what the run asks. Pinned-candidate runs capture nothing.
 */
async function captureRunCandidates<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
): Promise<readonly string[] | null> {
  if (!resolved.remote?.capturedCandidates) return []
  if (!adapter.captureCandidates) {
    throw new Error(`Classifier ${adapter.slug} captures candidates without a capture hook`)
  }
  const subjectMatch =
    subject.postId !== null
      ? sql`post_id = ${subject.postId}`
      : sql`rss_feed_item_id = ${subject.rssFeedItemId}`
  const { rows } = await query(
    sql`/* reserveClassifierRun.existing */
    SELECT 1 FROM classifier_runs
    WHERE classifier_id = (SELECT id FROM classifiers WHERE slug = ${adapter.slug})
      AND input_sha256 = ${current.inputSha256}
      AND configuration_sha256 = ${resolved.configurationSha256} AND `.append(subjectMatch),
  )
  if (rows.length > 0) return []
  const topicIds = await adapter.captureCandidates(query, subject, current)
  return topicIds && topicIds.length > 0 ? [...new Set(topicIds)] : null
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
