import { randomBytes } from 'node:crypto'
import { assertWhitelistedSqlIdentifier, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { sweepClassifierChildPageWithQuery } from '../services/data-retention/cleanup-classifier-children.mts'

export async function seedClassifierRunPayloadsAt(input: {
  slug: string
  postId: string
  actorId: string
  currentInputSha256: Buffer
  at: Date
  terminalCount: number
  pendingFirst?: boolean
}): Promise<{ terminalIds: string[]; pendingId: string; requestId: string }> {
  const { rows: classifiers } = await write<{
    id: string
  }>(sql`/* classifierRetentionFixtureClassifier */
    SELECT id FROM classifiers WHERE slug = ${input.slug}`)
  const classifierId = classifiers[0]!.id
  const ids = Array.from({ length: input.terminalCount + 1 }, (_, seq) =>
    uuidv7({ msecs: input.at.getTime(), seq }),
  )
  for (const [index, id] of ids.entries()) {
    const inputHash = index === 0 ? input.currentInputSha256 : randomBytes(32)
    const terminal = input.pendingFirst ? index > 0 : index < input.terminalCount
    await write(sql`/* seedClassifierRunPayloadAt */
      WITH identity AS (
        INSERT INTO classifier_run_identities (
          id, classifier_id, post_id, input_sha256, configuration_sha256
        ) VALUES (
          ${id}, ${classifierId}, ${input.postId}, ${inputHash},
          digest('{"version": 1}'::jsonb::text, 'sha256')
        ) RETURNING id
      )
      INSERT INTO classifier_runs (
        id, classifier_id, post_id, input_sha256, configuration_json,
        configuration_sha256, shared_actor_user_id, outcomes_persisted_at, completed_at
      ) SELECT id, ${classifierId}, ${input.postId}, ${inputHash}, '{"version": 1}'::jsonb,
        digest('{"version": 1}'::jsonb::text, 'sha256'), ${input.actorId},
        ${terminal ? input.at : null}, ${terminal ? input.at : null}
      FROM identity
    `)
  }
  const requestId = uuidv7()
  await write(sql`/* seedClassifierRunRequestIdentity */
    INSERT INTO classifier_run_requests (
      id, classifier_id, post_id, input_sha256, run_identity_id
    ) VALUES (
      ${requestId}, ${classifierId}, ${input.postId}, ${input.currentInputSha256}, ${ids[0]}
    )
  `)
  return {
    terminalIds: input.pendingFirst ? ids.slice(1) : ids.slice(0, input.terminalCount),
    pendingId: input.pendingFirst ? ids[0]! : ids.at(-1)!,
    requestId,
  }
}

export async function countClassifierRows(
  table: 'classifier_runs' | 'classifier_run_identities' | 'classifier_run_requests',
  ids: readonly string[],
): Promise<number> {
  const safeTable = assertWhitelistedSqlIdentifier(
    table,
    new Set(['classifier_runs', 'classifier_run_identities', 'classifier_run_requests']),
    'Classifier retention fixture table',
  )
  const statement = sql`/* countClassifierRetentionRows */ SELECT count(*)::int AS count FROM `
    .append(safeTable)
    .append(sql` WHERE id = ANY(${[...ids]}::uuid[])`)
  const { rows } = await write<{ count: number }>(statement)
  return rows[0]?.count ?? 0
}

type ClassifierChildRetentionCounts = {
  run_candidates: number
  agent_topics: number
  local_outcomes: number
}

/** Populate the three child families for owned run IDs without changing their terminal state. */
export async function seedClassifierChildRowsForRetentionTest(
  runIds: readonly string[],
  topicId: string,
): Promise<void> {
  const ids = [...runIds]
  await write(sql`/* seedClassifierRunCandidatesForRetention */
    INSERT INTO classifier_run_candidates (run_id, topic_id, ordinal)
    SELECT run_id, ${topicId}::uuid, 0 FROM unnest(${ids}::uuid[]) selected(run_id)`)
  await write(sql`/* seedClassifierAgentTopicsForRetention */
    INSERT INTO autotagger_agent_run_topics (run_id, topic_id)
    SELECT run_id, ${topicId}::uuid FROM unnest(${ids}::uuid[]) selected(run_id)`)
  await write(sql`/* seedClassifierLocalOutcomesForRetention */
    INSERT INTO post_classifier_local_outcomes (
      run_id, local_topic_id, is_flagged, reason, confidence_score,
      confidence_threshold, classification, detector, detector_model_version
    ) SELECT run_id, ${topicId}::uuid, TRUE, 'retention fixture', 0.5,
      0.5, 'ai', 'retention-fixture', 'retention-fixture-1'
    FROM unnest(${ids}::uuid[]) selected(run_id)`)
}

/** Count only child rows owned by the supplied runs in the shared dirty database. */
export async function readClassifierChildRetentionCounts(
  runIds: readonly string[],
): Promise<ClassifierChildRetentionCounts> {
  const ids = [...runIds]
  const { rows } = await write<ClassifierChildRetentionCounts>(sql`
    /* readClassifierChildRetentionCounts */
    SELECT
      (SELECT count(*)::int FROM classifier_run_candidates WHERE run_id = ANY(${ids}::uuid[]))
        AS run_candidates,
      (SELECT count(*)::int FROM autotagger_agent_run_topics WHERE run_id = ANY(${ids}::uuid[]))
        AS agent_topics,
      (SELECT count(*)::int FROM post_classifier_local_outcomes WHERE run_id = ANY(${ids}::uuid[]))
        AS local_outcomes`)
  return rows[0]!
}

/** Hold the real cursor row lock across both owned pages so other cleanup tests cannot interleave. */
export async function probeClassifierChildPagesForRetentionTest(
  sweep: 'run_candidates' | 'agent_topics' | 'local_outcomes',
  cutoffId: string,
  lowerBoundId: string,
  terminalId: string,
  pendingId: string,
): Promise<{
  pages: readonly { scanned: number; deleted: number; hasMore: boolean }[]
  cursorAfterFirst: string | null
  cursorAfterSecond: string | null
  terminalChildren: number
  pendingChildren: number
  runs: number
  identities: number
}> {
  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- each page depends on the previous raw-key checkpoint, and all observations must precede rollback on this owned transaction
  const first = await sweepClassifierChildPageWithQuery(query, sweep, cutoffId, lowerBoundId, 1)
  const { rows: afterFirst } = await query<{ cursor_id: string | null }>(sql`
    /* probeClassifierChildCursorAfterFirst */
    SELECT cursor_id FROM classifier_retention_cursors WHERE sweep = ${sweep}`)
  const second = await sweepClassifierChildPageWithQuery(query, sweep, cutoffId, lowerBoundId, 1)
  const { rows: afterSecond } = await query<{ cursor_id: string | null }>(sql`
    /* probeClassifierChildCursorAfterSecond */
    SELECT cursor_id FROM classifier_retention_cursors WHERE sweep = ${sweep}`)
  const safeTable = assertWhitelistedSqlIdentifier(
    {
      run_candidates: 'classifier_run_candidates',
      agent_topics: 'autotagger_agent_run_topics',
      local_outcomes: 'post_classifier_local_outcomes',
    }[sweep],
    new Set([
      'classifier_run_candidates',
      'autotagger_agent_run_topics',
      'post_classifier_local_outcomes',
    ]),
    'Classifier child retention probe table',
  )
  const { rows: children } = await query<{ terminal_children: number; pending_children: number }>(
    sql`/* probeClassifierChildDeletion */ SELECT
      (SELECT count(*)::int FROM `
      .append(safeTable)
      .append(sql` WHERE run_id = ${terminalId}) AS terminal_children,
      (SELECT count(*)::int FROM `)
      .append(safeTable)
      .append(sql` WHERE run_id = ${pendingId}) AS pending_children`),
  )
  const { rows: parents } = await query<{ runs: number; identities: number }>(sql`
    /* probeClassifierChildParents */ SELECT
      (SELECT count(*)::int FROM classifier_runs WHERE id = ANY(${[terminalId, pendingId]}::uuid[]))
        AS runs,
      (SELECT count(*)::int FROM classifier_run_identities
        WHERE id = ANY(${[terminalId, pendingId]}::uuid[])) AS identities`)
  // Deliberately no commit: async disposal rolls back both child DELETEs and cursor updates.
  return {
    pages: [first, second],
    cursorAfterFirst: afterFirst[0]?.cursor_id ?? null,
    cursorAfterSecond: afterSecond[0]?.cursor_id ?? null,
    terminalChildren: children[0]!.terminal_children,
    pendingChildren: children[0]!.pending_children,
    runs: parents[0]!.runs,
    identities: parents[0]!.identities,
  }
}

/** Remove only this probe's run tree; child FKs cascade after the rollback proof completes. */
export async function cleanupClassifierChildRetentionFixture(
  runIds: readonly string[],
  requestId: string,
): Promise<void> {
  const ids = [...runIds]
  await write(sql`/* cleanupClassifierChildRetentionRequest */
    DELETE FROM classifier_run_requests WHERE id = ${requestId}`)
  await write(sql`/* cleanupClassifierChildRetentionRuns */
    DELETE FROM classifier_runs WHERE id = ANY(${ids}::uuid[])`)
  await write(sql`/* cleanupClassifierChildRetentionIdentities */
    DELETE FROM classifier_run_identities WHERE id = ANY(${ids}::uuid[])`)
}
