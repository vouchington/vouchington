import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

/** @public Cross-workspace persistence boundary used by the copyright email agent. */
export async function appendCopyrightEmailIntakeRecommendation(input: {
  intakeId: string
  inputSha256: Buffer
  promptVersion: string
  model: string
  structuredOutput: Record<string, unknown>
}): Promise<boolean> {
  assert(input.inputSha256.length === 32, 422, 'Recommendation input SHA-256 must be 32 bytes')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ ses_message_id: string }>(
    sql`/* appendCopyrightEmailIntakeRecommendation:lockIntake */
    SELECT ses_message_id FROM copyright_notice_email_intakes WHERE id = ${input.intakeId} FOR UPDATE`,
  )
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  const { rowCount } = await transaction(sql`/* appendCopyrightEmailIntakeRecommendation */
    INSERT INTO copyright_notice_email_intake_recommendations (
      copyright_notice_email_intake_id, input_sha256, prompt_version, model, structured_output_ciphertext
    ) VALUES (
      ${input.intakeId}, ${input.inputSha256}, ${input.promptVersion}, ${input.model},
      ${encryptSecret(JSON.stringify(input.structuredOutput), copyrightEmailIntakePurpose(intake.ses_message_id))}
    )
    ON CONFLICT (copyright_notice_email_intake_id, input_sha256, prompt_version) DO NOTHING
  `)
  await transaction.commit()
  return rowCount === 1
}
