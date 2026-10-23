import { randomBytes } from 'node:crypto'
import { assertWhitelistedSqlIdentifier, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function seedClassifierRunPayloadsAt(input: {
  slug: string
  postId: string
  actorId: string
  currentInputSha256: Buffer
  at: Date
  terminalCount: number
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
    const terminal = index < input.terminalCount
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
  return { terminalIds: ids.slice(0, input.terminalCount), pendingId: ids.at(-1)!, requestId }
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
