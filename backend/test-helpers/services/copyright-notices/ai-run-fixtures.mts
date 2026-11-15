import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
} from '../../../services/copyright-notices/index.mts'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'

export const COPYRIGHT_AI_RUN_TABLES = {
  appeal: 'copyright_notice_appeal_recommendation_runs',
  guidance: 'copyright_notice_submission_guidance_runs',
  email: 'copyright_notice_email_intake_recommendation_runs',
} as const

/** One case carrying an appeal and a counter-notice, the two subjects of per-submission AI runs. */
export async function createCopyrightCaseWithAiRunSubjects() {
  const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
  const postId = await insertTestPost({
    title: `ai run ${crypto.randomUUID()}`,
    slug: `ai-run-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(poster.id)
  await insertTestPostImage({ postId, imageId })
  const { intake } = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'A photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: [
        {
          surfaceKind: 'post-image',
          postId,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    },
  })
  const noticeId = intake.copyright_notice_id
  const targetId = (await getCopyrightNoticePrivateAggregate(noticeId))?.targets[0]?.id
  if (!targetId) throw new Error('copyright target missing')
  const appeal = await createCopyrightAppeal(poster, noticeId, crypto.randomUUID(), {
    reason: 'I created this image.',
    targetIds: [targetId],
  })
  const counterNotice = await createCopyrightCounterNotice(poster, noticeId, crypto.randomUUID(), {
    name: 'Poster Name',
    address: '742 Test Terrace',
    telephone: '+1 (555) 010-0100',
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: 'Poster Name',
    targetIds: [targetId],
  })
  return {
    noticeId,
    appealSubmissionId: appeal.submission.id,
    counterNoticeSubmissionId: counterNotice.submission.id,
  }
}

type RunTable = (typeof COPYRIGHT_AI_RUN_TABLES)[keyof typeof COPYRIGHT_AI_RUN_TABLES]

const RESULT_COLUMNS: Record<RunTable, string> = {
  [COPYRIGHT_AI_RUN_TABLES.appeal]: 'copyright_notice_appeal_recommendation_id',
  [COPYRIGHT_AI_RUN_TABLES.guidance]: 'copyright_notice_submission_guidance_id',
  [COPYRIGHT_AI_RUN_TABLES.email]: 'copyright_notice_email_intake_recommendation_id',
}

export async function readTestCopyrightAiRun(table: RunTable, runId: string) {
  const { rows } = await read<{ status: string; completed: boolean; has_result: boolean }>(
    sql`/* readTestCopyrightAiRun */ SELECT status, completed_at IS NOT NULL AS completed, `
      .append(`${RESULT_COLUMNS[table]} IS NOT NULL AS has_result FROM ${table} WHERE id = `)
      .append(sql`${runId}`),
  )
  return rows[0] ?? null
}
