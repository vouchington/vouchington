import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { openCopyrightSecrets } from '../services/copyright-notices/encryption-keys.mts'

/** Reads this submission's immutable guidance evidence without exposing raw SQL to tests. */
export async function readTestCopyrightSubmissionGuidanceRecords(submissionId: string) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    input_sha256: Buffer
    prompt_version: string
    model: string
    guidance_ciphertext: string
  }>(sql`/* readTestCopyrightSubmissionGuidanceRecords */
    SELECT input_sha256, prompt_version, model, guidance_ciphertext
    FROM copyright_notice_submission_guidance
    WHERE copyright_notice_submission_id = ${submissionId}
    ORDER BY id
  `)
  await using secrets = rows.length
    ? await openCopyrightSecrets({ kind: 'submission', id: submissionId }, transaction)
    : null
  const result = rows.map(row => ({
    inputSha256: row.input_sha256.toString('hex'),
    promptVersion: row.prompt_version,
    model: row.model,
    guidance: JSON.parse(
      secrets!.decryptSecret(
        row.guidance_ciphertext,
        `copyright-submission-guidance:${submissionId}`,
      ),
    ) as unknown,
  }))
  await transaction.commit()
  return result
}
