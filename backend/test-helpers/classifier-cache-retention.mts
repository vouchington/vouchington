import { randomBytes } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import { deleteOldClassifierRuns } from '../services/data-retention/cleanup-classifier-records.mts'
import { sweepClassifierVersionedIdentityPageWithQuery } from '../services/data-retention/cleanup-classifier-identity-versions.mts'
import { insertTestAiUsageRecord } from './entities/ai-usage.mts'

export async function seedClassifierRetentionPricedUsage(runId: string): Promise<{
  recordId: string
  responseId: string
}> {
  const recordId = await insertTestAiUsageRecord({ classifierRunId: runId, costMicrounits: 319 })
  const responseId = `classifier-retirement-${randomBytes(16).toString('hex')}`
  await write(sql`/* seedClassifierRetirementProviderResponse */
    INSERT INTO ai_usage_provider_response_keys (response_id, ai_usage_record_id)
    VALUES (${responseId}, ${recordId})`)
  return { recordId, responseId }
}

export async function readClassifierRetentionPricedUsage(
  recordId: string,
  responseId: string,
): Promise<{
  classifier_run_identity_id: string | null
  cost_microunits: string
  currency_code: string
  response_id: string
} | null> {
  const { rows } = await write<{
    classifier_run_identity_id: string | null
    cost_microunits: string
    currency_code: string
    response_id: string
  }>(sql`/* readClassifierRetirementPricedLedger */
    SELECT record.*, key.response_id
    FROM ai_usage_records record
    JOIN ai_usage_provider_response_keys key ON key.ai_usage_record_id = record.id
    WHERE record.id = ${recordId} AND key.response_id = ${responseId}`)
  return rows[0] ?? null
}

export async function seedClassifierCacheIdentity(input: {
  classifierId: string
  promptVersionId: string
  postId: string
  inputSha256: Buffer
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* seedClassifierCacheIdentity */
    INSERT INTO classifier_run_identities (
      classifier_id, prompt_version_id, post_id, input_sha256
    ) VALUES (
      ${input.classifierId}, ${input.promptVersionId}, ${input.postId}, ${input.inputSha256}
    ) RETURNING id`)
  return rows[0]!.id
}

export async function seedClassifierCacheIdentityForSlug(input: {
  slug: string
  postId: string
  inputSha256: Buffer
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* seedClassifierCacheIdentityForSlug */
    INSERT INTO classifier_run_identities (classifier_id, post_id, input_sha256)
    SELECT classifier.id, ${input.postId}, ${input.inputSha256}
    FROM classifiers classifier WHERE classifier.slug = ${input.slug}
    RETURNING id`)
  return rows[0]!.id
}

export async function deleteClassifierCacheSubjectPost(postId: string): Promise<void> {
  await write(sql`/* deleteClassifierCacheSubjectPost */ DELETE FROM posts WHERE id = ${postId}`)
}

export async function probeClassifierRunRemovalRollback(runId: string): Promise<{
  removedRuns: number
  remainingIdentitiesInsideTransaction: number
}> {
  await using transaction = await beginTransaction()
  const removedRuns = await deleteOldClassifierRuns(transaction, [runId])
  const { rows } = await transaction<{ count: number }>(sql`
    /* checkClassifierRollbackInsideTransaction */
    SELECT count(*)::int AS count FROM classifier_run_identities WHERE id = ${runId}`)
  return { removedRuns, remainingIdentitiesInsideTransaction: rows[0]!.count }
}

/** Models a retention page after its child sweeps, then commits the production run deletion. */
export async function retireClassifierRunPayloadForTest(runId: string): Promise<number> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* retireClassifierRunCandidatesForTest */
    DELETE FROM classifier_run_candidates WHERE run_id = ${runId}`)
  await transaction(sql`/* retireClassifierAgentTopicsForTest */
    DELETE FROM autotagger_agent_run_topics WHERE run_id = ${runId}`)
  await transaction(sql`/* retireClassifierLocalOutcomesForTest */
    DELETE FROM post_classifier_local_outcomes WHERE run_id = ${runId}`)
  const removed = await deleteOldClassifierRuns(transaction, [runId])
  await transaction.commit()
  return removed
}

/** Runs one owned prompt scope through the production page and rolls back its shared cursor. */
export async function probeVersionedClassifierCachePageForTest(input: {
  classifierId: string
  oldPromptVersionId: string
  oldIdentityId: string
  newIdentityId: string
  startedAt: Date
}): Promise<{ scanned: number; deleted: number; oldInside: boolean; newInside: boolean }> {
  await using query = await beginTransaction()
  const lowerBoundId = getMinUUIDv7ForDate(input.startedAt)
  const cutoffId = getMinUUIDv7ForDate(new Date(Date.now() + 60_000))
  await query(sql`/* ensureVersionedClassifierCacheProbeCursor */
    INSERT INTO classifier_retention_cursors (sweep) VALUES ('versioned_identities')
    ON CONFLICT DO NOTHING`)
  // The update holds the one cursor row lock until rollback; no parallel sweep can interleave.
  await query(sql`/* positionVersionedClassifierCacheProbeCursor */
    UPDATE classifier_retention_cursors
    SET cursor_classifier_id = ${input.classifierId},
      cursor_prompt_version_id = ${input.oldPromptVersionId}, cursor_id = NULL,
      sweep_start_key = ${lowerBoundId}, sweep_end_key = ${cutoffId}
    WHERE sweep = 'versioned_identities'`)
  const page = await sweepClassifierVersionedIdentityPageWithQuery(query, cutoffId, lowerBoundId, 2)
  const { rows } = await query<{ id: string }>(sql`/* readVersionedClassifierCacheProbeIdentities */
    SELECT id FROM classifier_run_identities
    WHERE id = ANY(${[input.oldIdentityId, input.newIdentityId]}::uuid[])`)
  const remaining = new Set(rows.map(row => row.id))
  return {
    scanned: page.scanned,
    deleted: page.deleted,
    oldInside: remaining.has(input.oldIdentityId),
    newInside: remaining.has(input.newIdentityId),
  }
}

export async function deleteClassifierCacheIdentitiesForTest(
  ids: readonly string[],
): Promise<void> {
  await write(sql`/* deleteClassifierCacheIdentitiesForTest */
    DELETE FROM classifier_run_identities WHERE id = ANY(${[...ids]}::uuid[])`)
}
