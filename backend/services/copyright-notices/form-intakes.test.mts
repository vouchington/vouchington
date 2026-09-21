import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  countCopyrightActiveRestrictionsForNotice,
  readCopyrightNoticeTargetId,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  copyrightAppealRecommendations,
  appendCopyrightSubmissionAssessment,
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  getPendingCopyrightAgentDispatches,
  reviewCopyrightFormIntake,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'

describe('copyright form intakes', () => {
  it('atomically replays an unchanged idempotency key without another legal case', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `copyright ${crypto.randomUUID()}`,
      slug: `copyright-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(user.id)
    await insertTestPostImage({ postId, imageId })
    const input = {
      requesterUserId: user.id,
      requesterIdentity: `user:${user.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca' as const,
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'My photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    }
    const first = await createCopyrightFormIntake(input)
    const replay = await createCopyrightFormIntake(input)
    expect(first.isDuplicate).toBe(false)
    expect(replay).toMatchObject({
      isDuplicate: true,
      intake: { id: first.intake.id, copyright_notice_id: first.intake.copyright_notice_id },
    })
    await expect(
      createCopyrightFormIntake({
        ...input,
        idempotencyKey: crypto.randomUUID(),
        request: { ...input.request, workDescription: '   ' },
      }),
    ).rejects.toMatchObject({ status: 422 })

    const screening = {
      intakeId: first.intake.id,
      inputSha256: Buffer.alloc(32, 12),
      recommendation: 'not_obviously_invalid' as const,
      rationale: 'The structured form has no obvious spam markers.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    }
    const screeningId = await appendCopyrightFormScreening(screening)
    await expect(appendCopyrightFormScreening(screening)).resolves.toBe(screeningId)
  })

  it('treats an unknown screening submission as an inert queue replay', async () => {
    await expect(
      applyNonSpamSignedInCopyrightFormScreening('00000000-0000-7000-8000-000000000081'),
    ).resolves.toBeUndefined()
  })

  it('records a CAPTCHA-gated caller’s statutory counter-notice scope idempotently', async () => {
    const poster = await createTestUser()
    const claimant = await createTestUser()
    const postId = await insertTestPost({
      title: `copyright counter ${crypto.randomUUID()}`,
      slug: `copyright-counter-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      requesterUserId: claimant.id,
      requesterIdentity: `user:${claimant.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'My photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })
    // Resolve the durable target ID rather than trusting a form-provided location.
    const targetId = await readCopyrightNoticeTargetId(notice.intake.copyright_notice_id)
    const input = {
      name: 'Poster',
      address: '1 Main Street',
      telephone: '555-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Poster',
      targetIds: [targetId],
    }
    const key = crypto.randomUUID()
    const first = await createCopyrightCounterNotice(
      poster,
      notice.intake.copyright_notice_id,
      key,
      input,
    )
    const replay = await createCopyrightCounterNotice(
      poster,
      notice.intake.copyright_notice_id,
      key,
      input,
    )
    expect(first.isDuplicate).toBe(false)
    expect(replay).toMatchObject({ isDuplicate: true, submission: { id: first.submission.id } })

    const appeal = await createCopyrightAppeal(
      poster,
      notice.intake.copyright_notice_id,
      crypto.randomUUID(),
      { reason: 'The reported image is my original work.', targetIds: [targetId] },
    )
    await expect(getPendingCopyrightAgentDispatches()).resolves.toContainEqual({
      kind: 'appeal',
      submissionId: appeal.submission.id,
    })
    await copyrightAppealRecommendations.append({
      submissionId: appeal.submission.id,
      inputSha256: Buffer.alloc(32, 7),
      promptVersion: 'copyright-appeal-v1',
      model: 'test-model',
      recommendation: 'uncertain',
      rationale: 'Needs a moderator review.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.appealRecommendations).toEqual([
      expect.objectContaining({
        copyright_notice_submission_id: appeal.submission.id,
        recommendation: 'uncertain',
      }),
    ])
  })

  it('resumes any missing target restrictions after a partial automated run', async () => {
    const claimant = await createTestUser()
    const postId = await insertTestPost({
      title: `copyright recovery ${crypto.randomUUID()}`,
      slug: `copyright-recovery-${crypto.randomUUID()}`,
      createdById: claimant.id,
      markdown: 'images',
    })
    const imageIds = await Promise.all([insertTestImage(claimant.id), insertTestImage(claimant.id)])
    await Promise.all(imageIds.map(imageId => insertTestPostImage({ postId, imageId })))
    const notice = await createCopyrightFormIntake({
      requesterUserId: claimant.id,
      requesterIdentity: `user:${claimant.id}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Two photographs',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        claimantTargets: imageIds.map(imageId => ({
          postId,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        })),
      },
    })
    const screeningId = await appendCopyrightFormScreening({
      intakeId: notice.intake.id,
      inputSha256: Buffer.alloc(32, 9),
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam markers.',
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    })
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const targetIds = await readCopyrightNoticeTargetIds(notice.intake.copyright_notice_id)
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.intake.copyright_notice_id,
      targetId: targetIds[0]!,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(2)
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_notice_form_screening_id: screeningId,
          assessed_by_id: null,
          substantially_compliant: true,
        }),
      ]),
    )
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([expect.objectContaining({ human_reviewed_at: null })]),
    )
  })

  it('requires and records moderator approval before a guest form restricts a target', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `guest copyright ${crypto.randomUUID()}`,
      slug: `guest-copyright-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightFormIntake({
      requesterUserId: null,
      requesterIdentity: `guest:${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Guest claimant',
        claimantContact: 'guest@example.test',
        claimantEmail: 'guest@example.test',
        workDescription: 'Guest-owned photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Guest claimant',
        claimantTargets: [{ postId, imageId, hostedUseUrl: `https://voucha.ai/posts/${postId}` }],
      },
    })

    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      accepted: true,
      rationale: 'Structured fields and hosted target were verified.',
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(1)
  })
})

describe('createCopyrightGuestIdentity', () => {
  it('hashes the request IP into a stable guest identity', async () => {
    const { createCopyrightGuestIdentity } = await import('./form-intakes.mts')
    const first = createCopyrightGuestIdentity('203.0.113.10')
    expect(first).toMatch(/^guest:/)
    expect(createCopyrightGuestIdentity('203.0.113.10')).toBe(first)
    expect(createCopyrightGuestIdentity('198.51.100.20')).not.toBe(first)
  })
})
