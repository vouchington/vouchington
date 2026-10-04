import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestCopyrightSubmissionGuidanceRecords } from '@voucha/test-helpers/copyright-submission-guidance-records'
import {
  appendCopyrightGuestFiling,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
  issueCopyrightGuestCapability,
} from '@services/copyright-notices'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
} from '@ts-shared/utils/copyright-submission-guidance'
import {
  runCopyrightSubmissionGuidanceAgent,
  type CopyrightSubmissionGuidanceModelCaller,
} from './run.mts'

const counterGuidance = {
  summary: 'The filer disputes the identified image restriction.',
  elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
    element,
    status: 'present',
    gap: null,
  })),
  risk_notes: [],
}
const holdGuidance = {
  summary: 'The filer describes a proceeding for the identified material.',
  criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
    criterion,
    status: 'unclear',
    gap: 'The filing does not establish this fact.',
  })),
  risk_notes: [],
}

function modelResponse(guidance: unknown) {
  return {
    id: `resp-${crypto.randomUUID()}`,
    output: [
      {
        type: 'message',
        status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(guidance) }],
      },
    ],
  }
}

describe('copyright submission guidance agent', () => {
  it('sends only non-contact counter-notice facts and persists advisory guidance', async () => {
    const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await insertTestPost({
      title: `guidance ${crypto.randomUUID()}`,
      slug: `guidance-${crypto.randomUUID()}`,
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
        claimantDisplayName: 'Sentinel Claimant Display',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'A photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Sentinel Claimant Signature',
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
    if (!targetId) throw new Error('Counter-notice target missing')
    const submission = await createCopyrightCounterNotice(poster, noticeId, crypto.randomUUID(), {
      name: 'Sentinel Name',
      address: '742 Sentinel Terrace',
      telephone: '+1 (555) 010-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Sentinel Signature',
      targetIds: [targetId],
    })
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    const callModel = vi.fn<CopyrightSubmissionGuidanceModelCaller>(async () =>
      modelResponse(counterGuidance),
    )
    await expect(
      runCopyrightSubmissionGuidanceAgent(submission.submission.id, callModel),
    ).resolves.toBe('counter_notice')
    expect(callModel).toHaveBeenCalledOnce()
    const [kind, input] = callModel.mock.calls[0]!
    expect(kind).toBe('counter_notice')
    for (const sentinel of [
      'Sentinel Name',
      'Sentinel Terrace',
      '555',
      'Sentinel Signature',
      'Sentinel Claimant Display',
      'Sentinel Claimant Signature',
    ])
      expect(input).not.toContain(sentinel)
    const [row] = await readTestCopyrightSubmissionGuidanceRecords(submission.submission.id)
    expect(row).toMatchObject({
      inputSha256: createHash('sha256').update(input).digest('hex'),
      promptVersion: 'copyright-submission-guidance-v1',
      guidance: counterGuidance,
    })
    const after = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(after?.assessments).toEqual(before?.assessments)
    expect(after?.counterNoticeReviews).toEqual(before?.counterNoticeReviews)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.holdAssessments).toEqual(before?.holdAssessments)
  })

  it('strips email and phone variations before the model sees a hold and hashes identical residue equally', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const noticeId = intake.copyright_notice_id
    const staff = await createTestCopyrightStaff()
    const now = new Date()
    const [firstCapability, secondCapability] = await Promise.all([
      issueCopyrightGuestCapability({
        currentUser: staff,
        noticeId,
        expiresAt: new Date(now.getTime() + 60_000),
      }),
      issueCopyrightGuestCapability({
        currentUser: staff,
        noticeId,
        expiresAt: new Date(now.getTime() + 60_000),
      }),
    ])
    const statement = (email: string) =>
      `Court case 1:26-cv-01234 filed 2026-07-02. Contact ${email} and +1 (555) 010-0100. 17 U.S.C. § 512(g).`
    const [first, second] = await Promise.all([
      appendCopyrightGuestFiling({
        noticeId,
        token: firstCapability.token,
        now,
        kind: 'court_or_ccb_hold',
        statement: statement('alpha@example.test'),
      }),
      appendCopyrightGuestFiling({
        noticeId,
        token: secondCapability.token,
        now,
        kind: 'court_or_ccb_hold',
        statement: statement('beta@example.test'),
      }),
    ])
    const before = await getCopyrightNoticePrivateAggregate(noticeId)
    const callModel = vi.fn<CopyrightSubmissionGuidanceModelCaller>(async () =>
      modelResponse(holdGuidance),
    )
    await expect(runCopyrightSubmissionGuidanceAgent(first.id, callModel)).resolves.toBe(
      'court_or_ccb_hold',
    )
    await expect(runCopyrightSubmissionGuidanceAgent(second.id, callModel)).resolves.toBe(
      'court_or_ccb_hold',
    )
    expect(callModel).toHaveBeenCalledTimes(2)
    for (const [kind, input] of callModel.mock.calls) {
      expect(kind).toBe('court_or_ccb_hold')
      expect(input).not.toContain('@example.test')
      expect(input).not.toContain('+1 (555) 010-0100')
      expect(input).toContain('[phone removed]')
      expect(input).toContain('1:26-cv-01234')
      expect(input).toContain('2026-07-02')
    }
    const [firstRow] = await readTestCopyrightSubmissionGuidanceRecords(first.id)
    const [secondRow] = await readTestCopyrightSubmissionGuidanceRecords(second.id)
    expect(firstRow?.inputSha256).toBe(secondRow?.inputSha256)
    expect(firstRow?.guidance).toEqual(holdGuidance)
    expect(secondRow?.guidance).toEqual(holdGuidance)
    const after = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(after?.assessments).toEqual(before?.assessments)
    expect(after?.counterNoticeReviews).toEqual(before?.counterNoticeReviews)
    expect(after?.restrictions).toEqual(before?.restrictions)
    expect(after?.holdAssessments).toEqual(before?.holdAssessments)
  })
})
