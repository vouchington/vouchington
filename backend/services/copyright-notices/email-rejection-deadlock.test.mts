import { createTestUser } from '@voucha/test-helpers'
import { COPYRIGHT_EMAIL_THREAD_CHANGED } from '@modules/on-error/error-codes'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReview,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { describe, expect, it, onTestFinished } from 'vitest'
import { rejectCopyrightEmailIntakeDecision } from './copyright-email-decision-actions.mts'

describe('copyright email rejection conflict', () => {
  it.each(['40001', '40P01'])(
    'maps a %s decision conflict to 409 without a review or reply intent',
    async code => {
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const intake = await createUnparsedCopyrightEmailIntake()
      const failure = Object.assign(new Error('concurrent copyright email decision'), { code })
      let reachedRead = false
      const restore = runBeforePostgresStatementForTest(
        '/* rejectCopyrightEmailIntake:lock */',
        async () => {
          reachedRead = true
          throw failure
        },
      )
      onTestFinished(restore)
      try {
        await expect(
          rejectCopyrightEmailIntakeDecision({
            currentUser: moderator,
            intakeId: intake.id,
            recommendationId: null,
            manualFallbackReason: 'Manual review',
            rationale: 'The email does not identify a copyrighted work.',
          }),
        ).rejects.toMatchObject({
          status: 409,
          code: COPYRIGHT_EMAIL_THREAD_CHANGED,
          cause: failure,
        })
      } finally {
        restore()
      }
      expect(reachedRead).toBe(true)
      expect(await readCopyrightEmailIntakeReview(intake.id)).toEqual([])
      expect(await readCopyrightEmailIntakeResponses(intake.id)).toEqual([])
    },
  )
})
