import { decryptSecret } from '@modules/token-secrets'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReviewRecord,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from './email-intake-test-fixtures.mts'
import { copyrightEmailIntakePurpose } from './email-intakes.mts'
import {
  readCopyrightReviewTargetBreaches,
  recordCopyrightEmailIntakeLegalProcess,
  rejectCopyrightEmailIntake,
} from './index.mts'

const HOUR_MS = 60 * 60 * 1000

async function createModerator() {
  const record = await createTestUser()
  return { ...record, roles: ['moderator'] } as typeof record
}

describe('recordCopyrightEmailIntakeLegalProcess', () => {
  it('records the actor, time, and encrypted reason without a case, assessment, or reply', async () => {
    const moderator = await createModerator()
    const intake = await createParsedCopyrightEmailIntake()
    const reason = `Subpoena duces tecum for matter ${crypto.randomUUID()}`

    await recordCopyrightEmailIntakeLegalProcess({
      currentUser: moderator,
      intakeId: intake.id,
      reason,
    })

    const [review, ...rest] = await readCopyrightEmailIntakeReviewRecord(intake.id)
    expect(rest).toEqual([])
    expect(review).toMatchObject({
      decision: 'legal_process',
      reviewed_by_id: moderator.id,
      recommendation_id: null,
      promoted_copyright_notice_id: null,
    })
    expect(review?.reviewed_at).toBeInstanceOf(Date)
    expect(review?.rationale_ciphertext).not.toContain(reason)
    expect(
      JSON.parse(
        decryptSecret(
          review?.rationale_ciphertext as string,
          copyrightEmailIntakePurpose(intake.amazon_ses_message_id),
        ),
      ),
    ).toEqual({ rationale: reason, manual_fallback_reason: null })
    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
  })

  it('records an intake whose parse never landed, with no reply address to send to', async () => {
    const intake = await createUnparsedCopyrightEmailIntake()

    await recordCopyrightEmailIntakeLegalProcess({
      currentUser: await createModerator(),
      intakeId: intake.id,
      reason: 'Subpoena received before the parse landed.',
    })

    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toHaveLength(1)
    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
  })

  it('leaves the review-target count while an undecided email keeps waiting', async () => {
    const moderator = await createModerator()
    const base = Date.UTC(2016, 0, 1) + Math.floor(Math.random() * HOUR_MS)
    const subpoena = await createParsedCopyrightEmailIntake(new Date(base))
    const waiting = await createParsedCopyrightEmailIntake(new Date(base + 1))
    const sweep = () =>
      readCopyrightReviewTargetBreaches({
        now: new Date(),
        reviewTargetMinutes: 60,
        emailIntakeIds: [subpoena.id, waiting.id],
      })
    expect((await sweep()).emailIntakesWaitingPastTarget.emailIntakeIds).toEqual([
      subpoena.id,
      waiting.id,
    ])

    await recordCopyrightEmailIntakeLegalProcess({
      currentUser: moderator,
      intakeId: subpoena.id,
      reason: 'Subpoena for subscriber records.',
    })

    expect((await sweep()).emailIntakesWaitingPastTarget).toEqual({
      count: 1,
      emailIntakeIds: [waiting.id],
    })
  })

  it('refuses a caller without the staff role and records nothing', async () => {
    const intake = await createParsedCopyrightEmailIntake()

    await expect(
      recordCopyrightEmailIntakeLegalProcess({
        currentUser: await createTestUser(),
        intakeId: intake.id,
        reason: 'Subpoena.',
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toEqual([])
  })

  it('answers an unknown intake with 404', async () => {
    await expect(
      recordCopyrightEmailIntakeLegalProcess({
        currentUser: await createModerator(),
        intakeId: crypto.randomUUID(),
        reason: 'Subpoena.',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it.each(['', '   ', 'x'.repeat(1_001)])('refuses the reason %#', async reason => {
    const intake = await createParsedCopyrightEmailIntake()

    await expect(
      recordCopyrightEmailIntakeLegalProcess({
        currentUser: await createModerator(),
        intakeId: intake.id,
        reason,
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toEqual([])
  })

  it('answers a second decision with 409 and keeps the first record', async () => {
    const moderator = await createModerator()
    const intake = await createParsedCopyrightEmailIntake()
    const first = { currentUser: moderator, intakeId: intake.id, reason: 'First reason.' }
    await recordCopyrightEmailIntakeLegalProcess(first)
    const [recorded] = await readCopyrightEmailIntakeReviewRecord(intake.id)

    await expect(
      recordCopyrightEmailIntakeLegalProcess({ ...first, reason: 'Second reason.' }),
    ).rejects.toMatchObject({ status: 409 })

    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toEqual([recorded])
  })

  it('answers legal process after a rejection with 409', async () => {
    const moderator = await createModerator()
    const intake = await createParsedCopyrightEmailIntake()
    await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'No agent output.',
      rationale: 'Not a copyright notice.',
    })

    await expect(
      recordCopyrightEmailIntakeLegalProcess({
        currentUser: moderator,
        intakeId: intake.id,
        reason: 'Subpoena.',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toMatchObject([
      { decision: 'rejected' },
    ])
  })
})
