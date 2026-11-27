import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { seedUuidAtTimestamp } from './common.mts'

export const copyrightAgentDispatchStages = ['appeal', 'submission-guidance'] as const

const historyPerStage = 3_000

export async function seedCopyrightAgentDispatch(pendingPerStage: number) {
  // Put two full pages before the other shards' legal fixtures without adding an IDs filter.
  const timestamp = Date.UTC(1970, 0, 2) + randomInt(86_400_000)
  const noticeId = seedUuidAtTimestamp(timestamp, 0)
  const countPerStage = historyPerStage + pendingPerStage
  const appealIds = Array.from({ length: countPerStage }, (_, index) =>
    seedUuidAtTimestamp(timestamp, 2 * index + 1),
  )
  const guidanceIds = Array.from({ length: countPerStage }, (_, index) =>
    seedUuidAtTimestamp(timestamp, 2 * index + 2),
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCopyrightAgentDispatchNotice */
     INSERT INTO copyright_notices
       (id, jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version)
     VALUES ($1::uuid, 'us_dmca', 'copyright', $2::timestamptz,
       'v1:explain-contact', 'Agent dispatch EXPLAIN fixture', 'explain-v1')`,
    [noticeId, new Date(timestamp)],
  )
  const submissions = await transaction(
    `/* seedCopyrightAgentDispatchSubmissions */
     INSERT INTO copyright_notice_submissions
       (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
     SELECT id, $1::uuid, 'appeal'::copyright_notice_submission_kinds, $2::timestamptz, 'staff'::copyright_notice_submission_source_kinds, 'v1:explain-body'
     FROM unnest($3::uuid[]) AS appeal(id)
     UNION ALL
     SELECT id, $1::uuid, 'counter_notice'::copyright_notice_submission_kinds, $2::timestamptz, 'staff'::copyright_notice_submission_source_kinds, 'v1:explain-body'
     FROM unnest($4::uuid[]) AS guidance(id)`,
    [noticeId, new Date(timestamp), appealIds, guidanceIds],
  )
  assert.equal(submissions.rowCount, 2 * countPerStage)
  const resolvedAppeals = await transaction(
    `/* seedCopyrightAgentDispatchAppealHistory */
     INSERT INTO copyright_notice_appeal_recommendations
       (copyright_notice_submission_id, input_sha256, prompt_version, model,
        recommendation, rationale_ciphertext)
     SELECT id, sha256(uuid_send(id)), 'explain-v1', 'explain-model',
       'uncertain', 'v1:explain-result'
     FROM unnest($1::uuid[]) AS appeal(id)`,
    [appealIds.slice(0, historyPerStage)],
  )
  assert.equal(resolvedAppeals.rowCount, historyPerStage)
  const resolvedGuidance = await transaction(
    `/* seedCopyrightAgentDispatchGuidanceHistory */
     INSERT INTO copyright_notice_submission_guidance
       (copyright_notice_submission_id, input_sha256, prompt_version, model, guidance_ciphertext)
     SELECT id, sha256(uuid_send(id)), 'explain-v1', 'explain-model', 'v1:explain-result'
     FROM unnest($1::uuid[]) AS guidance(id)`,
    [guidanceIds.slice(0, historyPerStage)],
  )
  assert.equal(resolvedGuidance.rowCount, historyPerStage)
  await transaction.commit()

  return {
    pendingByStage: {
      appeal: appealIds.slice(historyPerStage),
      'submission-guidance': guidanceIds.slice(historyPerStage),
    },
    seededRows: {
      copyright_notices: 1,
      copyright_notice_submissions: 2 * countPerStage,
      copyright_notice_appeal_recommendations: historyPerStage,
      copyright_notice_submission_guidance: historyPerStage,
    },
    cleanup: async () => {
      await using cleanup = await beginTransaction()
      await cleanup(
        `/* permitCopyrightAgentDispatchCleanup */
         SELECT set_config('app.copyright_case_purge_notice_id', $1::text, true),
           set_config('app.copyright_case_purge_table', 'copyright_notice_appeal_recommendations', true)`,
        [noticeId],
      )
      await cleanup(
        `/* deleteCopyrightAgentDispatchAppealHistory */
         DELETE FROM copyright_notice_appeal_recommendations
         WHERE copyright_notice_submission_id = ANY($1::uuid[])`,
        [appealIds.slice(0, historyPerStage)],
      )
      await cleanup(
        `/* permitCopyrightAgentDispatchGuidanceCleanup */
         SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_submission_guidance', true)`,
      )
      await cleanup(
        `/* deleteCopyrightAgentDispatchGuidanceHistory */
         DELETE FROM copyright_notice_submission_guidance
         WHERE copyright_notice_submission_id = ANY($1::uuid[])`,
        [guidanceIds.slice(0, historyPerStage)],
      )
      await cleanup(
        `/* permitCopyrightAgentDispatchSubmissionCleanup */
         SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true)`,
      )
      await cleanup(
        `/* deleteCopyrightAgentDispatchSubmissions */
         DELETE FROM copyright_notice_submissions WHERE copyright_notice_id = $1::uuid`,
        [noticeId],
      )
      await cleanup(
        `/* permitCopyrightAgentDispatchNoticeCleanup */
         SELECT set_config('app.copyright_case_purge_table', 'copyright_notices', true)`,
      )
      await cleanup(
        '/* deleteCopyrightAgentDispatchNotice */ DELETE FROM copyright_notices WHERE id = $1::uuid',
        [noticeId],
      )
      await cleanup(
        `/* deleteCopyrightAgentDispatchIdentity */
         DELETE FROM retained_copyright_notice_identities WHERE id = $1::uuid`,
        [noticeId],
      )
      await cleanup.commit()
      await analyzeCopyrightAgentDispatch()
    },
  }
}

export async function analyzeCopyrightAgentDispatch() {
  await write(`/* analyzeCopyrightAgentDispatch */
    ANALYZE copyright_notices, copyright_notice_submissions,
      copyright_notice_appeal_recommendations, copyright_notice_submission_guidance`)
}
