import { processCopyrightActionIntent, createCopyrightAppeal } from './index.mts'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightAppeal } from './submission-reviews.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'

describe('appeal as first human review', () => {
  useCopyrightIntakeEnvironment()
  useAutomaticProvisionalWithholding()
  it.each(['confirm', 'reverse'] as const)(
    'records the %s review once without dropping the appellant status update',
    async action => {
      const poster = await createTestUser()
      const { notice } = await createClearScreenedForm(1, { poster })
      const caseId = notice.intake.copyright_notice_id
      await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
      const aggregate = (await getCopyrightNoticePrivateAggregate(caseId))!
      const restriction = aggregate.restrictions[0]!
      const appeal = await createCopyrightAppeal(poster, caseId, crypto.randomUUID(), {
        reason: 'I created the image.',
        targetIds: [restriction.copyright_notice_target_id],
      })
      const decision = {
        submissionId: appeal.submission.id,
        currentUser: await createTestUser({ extraRoles: ['moderator'] }),
        recommendationId: null,
        manualFallbackReason: 'Manual review.',
        rationale: 'Reviewed the complete record.',
        decisions: [{ restrictionId: restriction.id, action }],
      }
      await reviewCopyrightAppeal(decision)
      await reviewCopyrightAppeal(decision)
      const statements = await readTestCopyrightStatementIntents(caseId)
      expect(statements.filter(row => row.delivery_kind === 'poster_review_notice')).toHaveLength(2)
      expect(
        statements.filter(row => row.delivery_kind === 'poster_restoration_notice'),
      ).toHaveLength(0)
      expect(
        statements.find(
          row => row.delivery_kind === 'poster_review_notice' && row.channel === 'email',
        )?.text,
      ).toContain(action === 'confirm' ? 'A person confirmed' : 'A person reversed')
      let restorationText: string | null | undefined
      if (action === 'reverse') {
        const restore = (await getCopyrightNoticePrivateAggregate(caseId))!.actionIntents.find(
          intent => intent.action === 'restore',
        )!
        await processCopyrightActionIntent(
          restore.id,
          new Date(),
          createTestCopyrightDeliveryDependencies(async () => undefined),
        )
        const restoration = (await readTestCopyrightStatementIntents(caseId)).find(
          row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
        )!
        restorationText = restoration.text
      }
      expect(restorationText?.includes('the appeal reversed the decision') ?? false).toBe(
        action === 'reverse',
      )
      expect((await getCopyrightNoticePrivateAggregate(caseId))!.deliveryIntents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ delivery_kind: 'status_update', recipient_user_id: poster.id }),
        ]),
      )
    },
  )
})
