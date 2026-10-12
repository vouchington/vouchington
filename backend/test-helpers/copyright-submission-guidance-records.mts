import { read } from './fixture-executor.mts'
import { decryptSecret } from '@modules/token-secrets'
import sql from './fixture-sql.mts'

/** Reads this submission's immutable guidance evidence without exposing raw SQL to tests. */
export async function readTestCopyrightSubmissionGuidanceRecords(submissionId: string) {
  const { rows } = await read<{
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
  return rows.map(row => ({
    inputSha256: row.input_sha256.toString('hex'),
    promptVersion: row.prompt_version,
    model: row.model,
    guidance: JSON.parse(
      decryptSecret(row.guidance_ciphertext, `copyright-submission-guidance:${submissionId}`),
    ) as unknown,
  }))
}
