import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { retireClassifierRunPayloadForTest } from './classifier-cache-retention.mts'

/** Rolls the classifier back from its active prompt version to an earlier one. */
export async function rollBackActivePromptVersionForTest(
  currentPromptVersionId: string,
  previousPromptVersionId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* deactivateRolledBackClassifierPromptForTest */
    UPDATE classifier_prompt_versions SET deactivated_at = CURRENT_TIMESTAMP
    WHERE id = ${currentPromptVersionId}`)
  await transaction(sql`/* reactivateRolledBackClassifierPromptForTest */
    UPDATE classifier_prompt_versions SET deactivated_at = NULL
    WHERE id = ${previousPromptVersionId}`)
  await transaction.commit()
}

/** A versioned run payload that was superseded before it ever completed, then retired. */
export async function retireSupersededVersionedRunPayloadForTest(input: {
  classifierId: string
  promptVersionId: string
  postId: string
  actorId: string
  inputSha256: Buffer
  at: Date
}): Promise<{ runId: string; identityRemaining: number }> {
  const runId = uuidv7({ msecs: input.at.getTime() })
  await write(sql`/* seedSupersededVersionedClassifierRunForTest */
    WITH identity AS (
      INSERT INTO classifier_run_identities (
        id, classifier_id, prompt_version_id, post_id, input_sha256, configuration_sha256
      ) VALUES (
        ${runId}, ${input.classifierId}, ${input.promptVersionId}, ${input.postId},
        ${input.inputSha256}, digest('{}'::jsonb::text, 'sha256')
      ) RETURNING id
    )
    INSERT INTO classifier_runs (
      id, classifier_id, prompt_version_id, post_id, input_sha256, configuration_json,
      configuration_sha256, shared_actor_user_id, superseded_at
    ) SELECT id, ${input.classifierId}, ${input.promptVersionId}, ${input.postId},
      ${input.inputSha256}, '{}'::jsonb, digest('{}'::jsonb::text, 'sha256'), ${input.actorId},
      ${input.at}
    FROM identity`)
  await retireClassifierRunPayloadForTest(runId)
  const { rows } = await write<{ count: number }>(sql`/* countSupersededVersionedIdentityForTest */
    SELECT count(*)::int AS count FROM classifier_run_identities WHERE id = ${runId}`)
  return { runId, identityRemaining: rows[0]!.count }
}
