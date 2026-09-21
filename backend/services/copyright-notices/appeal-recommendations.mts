import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { isUUID } from '@modules/utils'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightSubmissionPurpose } from './submissions.mts'

export type CopyrightAppealRecommendationInput = {
  appeal: {
    reason: string
    targetIds: string[]
  }
  notice: {
    workDescription: string
    acceptedAt: Date | null
    provisionalWithholdingAt: Date | null
    restrictedTargetCount: number
    restoredTargetCount: number
  }
}

async function getCopyrightAppealForRecommendation(
  submissionId: string,
): Promise<CopyrightAppealRecommendationInput | null> {
  const { rows } = await read<{
    body_ciphertext: string
    copyright_notice_id: string
    work_description: string
    accepted_at: Date | null
    provisional_withholding_at: Date | null
    restricted_target_count: string
    restored_target_count: string
  }>(sql`/* getCopyrightAppealForRecommendation */
    SELECT submission.body_ciphertext, submission.copyright_notice_id,
      notice.work_description, notice.accepted_at, notice.provisional_withholding_at,
      count(restriction.id) FILTER (WHERE restriction.lifted_at IS NULL) AS restricted_target_count,
      count(restriction.id) FILTER (WHERE restriction.lifted_at IS NOT NULL) AS restored_target_count
    FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    LEFT JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    LEFT JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    WHERE submission.id = ${submissionId} AND submission.kind = 'appeal'
    GROUP BY submission.id, notice.id
  `)
  const row = rows[0]
  if (!row) return null
  return {
    appeal: parseStoredCopyrightAppeal(
      decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(submissionId)),
    ),
    notice: {
      workDescription: row.work_description,
      acceptedAt: row.accepted_at,
      provisionalWithholdingAt: row.provisional_withholding_at,
      restrictedTargetCount: Number(row.restricted_target_count),
      restoredTargetCount: Number(row.restored_target_count),
    },
  }
}

function parseStoredCopyrightAppeal(value: string): { reason: string; targetIds: string[] } {
  let parsed: { reason?: unknown; targetIds?: unknown } | null
  try {
    parsed = JSON.parse(value) as { reason?: unknown; targetIds?: unknown }
  } catch {
    throw new TypeError('Stored copyright appeal is not valid JSON')
  }
  if (
    !parsed ||
    typeof parsed.reason !== 'string' ||
    parsed.reason.trim().length === 0 ||
    parsed.reason.length > 50_000 ||
    !Array.isArray(parsed.targetIds) ||
    parsed.targetIds.length === 0 ||
    parsed.targetIds.length > 20 ||
    !parsed.targetIds.every(targetId => typeof targetId === 'string' && isUUID(targetId)) ||
    new Set(parsed.targetIds).size !== parsed.targetIds.length
  )
    throw new TypeError('Stored copyright appeal has an invalid shape')
  return { reason: parsed.reason, targetIds: parsed.targetIds }
}

async function appendCopyrightAppealRecommendation(input: {
  submissionId: string
  inputSha256: Buffer
  promptVersion: string
  model: string
  recommendation: 'confirm' | 'modify' | 'reverse' | 'uncertain'
  rationale: string
}): Promise<void> {
  await write(sql`/* appendCopyrightAppealRecommendation */
    INSERT INTO copyright_notice_appeal_recommendations (copyright_notice_submission_id, input_sha256, prompt_version, model, recommendation, rationale_ciphertext)
    VALUES (${input.submissionId}, ${input.inputSha256}, ${input.promptVersion}, ${input.model}, ${input.recommendation}, ${encryptSecret(input.rationale, `copyright-appeal:${input.submissionId}`)})
    ON CONFLICT (copyright_notice_submission_id, input_sha256, prompt_version) DO NOTHING
  `)
}

export const copyrightAppealRecommendations = {
  get: getCopyrightAppealForRecommendation,
  append: appendCopyrightAppealRecommendation,
}
