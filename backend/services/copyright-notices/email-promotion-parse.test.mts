import { describe, expect, it } from 'vitest'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  createUnparsedCopyrightEmailIntake,
  readCopyrightEmailPromotionEffects,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'

describe('copyright email promotion parse prerequisite', () => {
  useCopyrightIntakeEnvironment()
  it('waits for a completed parse before manual fallback approval', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `Copyright email unparsed approval ${crypto.randomUUID()}`,
      slug: `copyright-email-unparsed-approval-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'Hosted copyright target.',
    })
    const imageId = await insertTestImage(poster.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const intake = await createUnparsedCopyrightEmailIntake()
    const input = {
      currentUser: moderator,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'The extraction agent is unavailable.',
      jurisdiction: 'us_dmca' as const,
      claimantDisplayName: 'Claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'Original photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      targets: [
        {
          placementId,
          placementRevision: 1,
          imageId,
          bindingFamily: 'post' as const,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
      rationale: 'The email contains the statutory notice statements.',
    }

    await expect(promoteCopyrightEmailIntake(input)).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_THREAD_CHANGED,
    })
    await expect(readCopyrightEmailIntakeNoticeLinks(intake.id)).resolves.toEqual([])
    await expect(readCopyrightEmailPromotionEffects(intake.id, placementId)).resolves.toMatchObject(
      { reviews: 0, evidence: 0, notice_targets: 0 },
    )

    await recordCopyrightEmailParse(intake, {
      status: 'failed',
      error: 'The original email could not be parsed as RFC 5322 MIME.',
    })
    const promoted = await promoteCopyrightEmailIntake(input)
    await expect(readCopyrightEmailIntakeNoticeLinks(intake.id)).resolves.toEqual([
      { copyright_notice_id: promoted.noticeId, link_kind: 'initial' },
    ])
  })
})
