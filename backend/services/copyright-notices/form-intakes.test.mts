import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { appendTestCopyrightFormScreening } from '@voucha/test-helpers/copyright-form-screenings'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import {
  copyrightAppealRecommendations,
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
} from './index.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { claimCopyrightFormScreening } from './form-screening-executions.mts'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright form intakes', () => {
  it('conflicts with a concurrent intake and replays the committed legal case', async () => {
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
      currentUser: user,
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
        claimantTargets: [
          {
            surfaceKind: 'post-image' as const,
            postId,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
      },
    }
    const restore = afterPostgresTransactionQueryForTest(
      'createCopyrightFormIntake:findDuplicate',
      values => values.includes(input.idempotencyKey),
      async () => {
        expect(await createCopyrightFormIntake(input)).toMatchObject({ isDuplicate: false })
      },
    )
    try {
      await expect(createCopyrightFormIntake(input)).rejects.toMatchObject({
        status: 409,
        cause: { code: '23505' },
      })
    } finally {
      restore()
    }
    const replay = await createCopyrightFormIntake(input)
    expect(replay.isDuplicate).toBe(true)
    await expect(
      createCopyrightFormIntake({
        ...input,
        idempotencyKey: crypto.randomUUID(),
        request: { ...input.request, workDescription: '   ' },
      }),
    ).rejects.toMatchObject({ status: 422 })

    const screening = {
      intakeId: replay.intake.id,
      inputSha256: Buffer.alloc(32, 12),
      recommendation: 'not_obviously_invalid' as const,
      rationale: 'The structured form has no obvious spam markers.',
      guidance: testCopyrightFormGuidance,
      promptVersion: 'copyright-form-screening-v2',
      model: 'test-model',
    }
    await appendTestCopyrightFormScreening(screening)
    await expect(claimCopyrightFormScreening(replay.intake.id)).resolves.toBeNull()
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
      currentUser: claimant,
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
        claimantTargets: [
          {
            surfaceKind: 'post-image' as const,
            postId,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
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
    const submit = () =>
      createCopyrightCounterNotice(poster, notice.intake.copyright_notice_id, key, input)
    const restore = afterPostgresTransactionQueryForTest(
      'createCopyrightSubmission:existing',
      values => values.includes(poster.id),
      async () => {
        expect(await submit()).toMatchObject({ isDuplicate: false })
      },
    )
    try {
      await expect(submit()).rejects.toMatchObject({ status: 409, cause: { code: '23505' } })
    } finally {
      restore()
    }
    const replay = await submit()
    expect(replay.isDuplicate).toBe(true)
    const afterRetry = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(
      afterRetry?.submissions.filter(submission => submission.kind === 'counter_notice'),
    ).toEqual([expect.objectContaining({ id: replay.submission.id })])

    const appeal = await createCopyrightAppeal(
      poster,
      notice.intake.copyright_notice_id,
      crypto.randomUUID(),
      { reason: 'The reported image is my original work.', targetIds: [targetId] },
    )
    await expect(readTestPendingCopyrightAgentDispatches(appeal.submission.id)).resolves.toEqual([
      { kind: 'appeal', submissionId: appeal.submission.id },
    ])
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
