import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

type CopyrightEmailRecommendationInput = {
  intakeId: string
  inputSha256: Buffer
  promptVersion: string
  model: string
  structuredOutput: Record<string, unknown>
}

/** Cross-workspace persistence boundary used by the copyright email agent. */
export async function appendCopyrightEmailIntakeRecommendation(
  input: CopyrightEmailRecommendationInput,
): Promise<boolean> {
  assert(input.inputSha256.length === 32, 422, 'Recommendation input SHA-256 must be 32 bytes')
  // The link is immutable after creation. If it appears while taking the intake lock,
  // retry with its notice locked first, matching the erasure notice-to-child order.
  const first = await appendWithCurrentLink(input)
  if (first !== 'link-changed') return first
  const second = await appendWithCurrentLink(input)
  if (second === 'link-changed')
    throw new Error('Copyright email intake link changed more than once')
  return second
}

async function appendWithCurrentLink(
  input: CopyrightEmailRecommendationInput,
): Promise<boolean | 'link-changed'> {
  await using transaction = await beginTransaction()
  const { rows: links } = await transaction<{ copyright_notice_id: string }>(sql`
      /* appendCopyrightEmailIntakeRecommendation:link */
      SELECT copyright_notice_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`)
  const noticeId = links[0]?.copyright_notice_id ?? null
  if (noticeId)
    await transaction(sql`/* appendCopyrightEmailIntakeRecommendation:lockNotice */
      SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR KEY SHARE`)
  const { rows } = await transaction<{
    amazon_ses_message_id: string
    has_raw_source: boolean
  }>(sql`
      /* appendCopyrightEmailIntakeRecommendation:lockIntake */
      SELECT intake.amazon_ses_message_id,
        intake.raw_storage_object_id IS NOT NULL AS has_raw_source
      FROM copyright_notice_email_intakes intake
      WHERE intake.id = ${input.intakeId}
      FOR UPDATE OF intake`)
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  if (!intake.has_raw_source) return false
  const { rows: activeReceipts } = await transaction(sql`
      /* appendCopyrightEmailIntakeRecommendation:lockReceipt */
      SELECT id FROM copyright_notice_email_intake_receipts
      WHERE id = ${input.intakeId} AND erased_at IS NULL FOR SHARE`)
  if (!activeReceipts[0]) return false
  const { rows: currentLinks } = await transaction<{ copyright_notice_id: string }>(sql`
      /* appendCopyrightEmailIntakeRecommendation:recheckLink */
      SELECT copyright_notice_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`)
  if ((currentLinks[0]?.copyright_notice_id ?? null) !== noticeId) return 'link-changed'
  if (noticeId) {
    const { rows: erased } =
      await transaction(sql`/* appendCopyrightEmailIntakeRecommendation:erasure */
      SELECT 1 FROM copyright_notice_retention_erasures
      WHERE copyright_notice_id = ${noticeId} LIMIT 1`)
    if (erased[0]) return false
  }
  const recommendationId = uuidv7()
  const outputCiphertext = encryptSecret(
    JSON.stringify(input.structuredOutput),
    copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
  )
  const { rows: insertedIdentity } = await transaction<{ id: string }>(sql`
    /* appendCopyrightEmailIntakeRecommendation:identity */
    INSERT INTO copyright_notice_email_intake_recommendation_identities
      (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
    VALUES (${recommendationId}, ${input.intakeId}, ${input.inputSha256}, ${input.promptVersion})
    ON CONFLICT (copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
    DO NOTHING RETURNING id`)
  if (insertedIdentity.length === 0) return false
  await transaction(sql`/* appendCopyrightEmailIntakeRecommendation */
    INSERT INTO copyright_notice_email_intake_recommendations (
      id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version, model,
      structured_output_ciphertext
    ) VALUES (${recommendationId}, ${input.intakeId}, ${input.inputSha256}, ${input.promptVersion},
      ${input.model}, ${outputCiphertext})
  `)
  await transaction(sql`/* appendCopyrightEmailIntakeRecommendation:current */
    UPDATE copyright_notice_email_intakes SET
      recommendation_completed_at = CURRENT_TIMESTAMP,
      current_recommendation_identity_id = ${recommendationId},
      current_recommendation_output_ciphertext = ${outputCiphertext}
    WHERE id = ${input.intakeId}`)
  await transaction.commit()
  return true
}
