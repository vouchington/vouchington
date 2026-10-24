import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'

type CopyrightEmailRecommendationInput = {
  intakeId: string
  inputSha256: Buffer
  promptVersion: string
  model: string
  structuredOutput: Record<string, unknown>
}

/** @public Cross-workspace persistence boundary used by the copyright email agent. */
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
  const { rows } = await transaction<{ amazon_ses_message_id: string }>(sql`
      /* appendCopyrightEmailIntakeRecommendation:lockIntake */
      SELECT amazon_ses_message_id FROM copyright_notice_email_intakes
      WHERE id = ${input.intakeId} FOR UPDATE`)
  const intake = rows[0]
  assert(intake, 404, 'Copyright email intake not found')
  const { rows: currentLinks } = await transaction<{ copyright_notice_id: string }>(sql`
      /* appendCopyrightEmailIntakeRecommendation:recheckLink */
      SELECT copyright_notice_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${input.intakeId}`)
  if ((currentLinks[0]?.copyright_notice_id ?? null) !== noticeId) return 'link-changed'
  const { rowCount } = await transaction(sql`/* appendCopyrightEmailIntakeRecommendation */
    INSERT INTO copyright_notice_email_intake_recommendations (
      copyright_notice_email_intake_id, input_sha256, prompt_version, model, structured_output_ciphertext
    ) SELECT source.id, ${input.inputSha256}, ${input.promptVersion}, ${input.model},
      ${encryptSecret(JSON.stringify(input.structuredOutput), copyrightEmailIntakePurpose(intake.amazon_ses_message_id))}
    FROM copyright_notice_email_intakes source
    WHERE source.id = ${input.intakeId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_notice_links link
        JOIN copyright_notice_retention_erasures erased
          ON erased.copyright_notice_id = link.copyright_notice_id
        WHERE link.copyright_notice_email_intake_id = source.id
      )
    ON CONFLICT (copyright_notice_email_intake_id, input_sha256, prompt_version) DO NOTHING
  `)
  await transaction.commit()
  return rowCount === 1
}
