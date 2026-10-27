import type { OwnedTransaction } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { classifierRetentionCutoff } from '@services/classifiers/retention-window'
import { reserveClassifierDecisionBatch } from '@services/classifiers/write-decision-lineage'
import { retainPublicationIdentityBridges } from '@services/post-publication/identity-bridges'
import sql from 'sql-template-strings'
import { pinnedStoredCandidateIds } from './remote-plan.mts'
import { claimClassifierRunIdentity } from './run-identity.mts'
import type {
  ClassifierRunSubject,
  CurrentClassifierRunInput,
  ReservedClassifierRun,
  ResolvedClassifierRun,
} from './types.mts'

/** Claim the immutable key, then create or replay its bounded payload in the same transaction. */
export async function insertClassifierRun<C>(
  query: OwnedTransaction,
  slug: string,
  subject: ClassifierRunSubject,
  current: CurrentClassifierRunInput,
  resolved: ResolvedClassifierRun<C>,
): Promise<ReservedClassifierRun & { inserted: boolean; retired: boolean }> {
  if (current.communityId) {
    await retainPublicationIdentityBridges(query, 'community', [current.communityId])
  }
  const remote = resolved.remote
  const proposedBatchId = remote ? await generateBatchId(query) : null
  const activeCutoffId = timestampToUuidv7LowerBound(classifierRetentionCutoff().getTime())
  const { id: identityId, isNew } = await claimClassifierRunIdentity(
    query,
    slug,
    subject,
    current.inputSha256,
    remote?.promptVersionId ?? null,
    resolved.configurationSha256,
  )
  const { rows } = isNew
    ? await query<{
        id: string
        decision_batch_id: string | null
      }>(sql`/* reserveClassifierRun.insert */
        INSERT INTO classifier_runs (
          id, classifier_id, prompt_version_id, post_id, rss_feed_item_id, input_sha256, configuration_json,
          configuration_sha256, shared_actor_user_id, decision_batch_id
        ) VALUES (
          ${identityId}, (SELECT id FROM classifiers WHERE slug = ${slug}), ${remote?.promptVersionId ?? null},
          ${subject.postId}, ${subject.rssFeedItemId}, ${current.inputSha256},
          ${resolved.configurationJson}::jsonb, ${resolved.configurationSha256},
          ${resolved.actorId}, ${proposedBatchId}
        ) RETURNING id, decision_batch_id`)
    : await query<{ id: string; decision_batch_id: string | null }>(sql`
        /* reserveClassifierRun.existingPayload */
        UPDATE classifier_runs SET superseded_at = NULL WHERE id = ${identityId}
          AND configuration_sha256 = ${resolved.configurationSha256}
          AND configuration_json = ${resolved.configurationJson}::jsonb
          AND shared_actor_user_id = ${resolved.actorId}
          AND prompt_version_id IS NOT DISTINCT FROM ${remote?.promptVersionId ?? null}::uuid
          AND (id >= ${activeCutoffId} OR
            (completed_at IS NULL AND superseded_at IS NULL AND terminal_failed_at IS NULL))
        RETURNING id, decision_batch_id`)
  const inserted = rows[0]
  if (!inserted && isNew) throw new Error('classifier run reservation did not return a receipt')
  if (!inserted) {
    return {
      runId: identityId,
      subject,
      inputSha256: current.inputSha256,
      configurationSha256: resolved.configurationSha256,
      decisionBatchId: null,
      inserted: false,
      retired: true,
    }
  }
  if (remote && isNew && proposedBatchId !== null) {
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
    retired: false,
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
