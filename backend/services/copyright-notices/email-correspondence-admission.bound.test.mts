import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { interleaveCopyrightOwnedRead } from '@voucha/test-helpers/copyright-owned-read-interleave'
import { copyrightRaceResult } from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import { readCopyrightSupplementAdmissionState } from '@voucha/test-helpers/copyright-supplement-admission-state'
import { seedCommittedCopyrightSupplement } from '@voucha/test-helpers/copyright-committed-supplement'
import { admitCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'

describe('copyright correspondence and recommendation admission', () => {
  it('couples each overlapping admission result to its complete committed legal facts', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation(false)
    const intake = await createParsedCopyrightEmailIntake()
    expect(
      await linkCopyrightEmailIntakeToNotice({ intakeId: intake.id, noticeId, linkKind: 'thread' }),
    ).toBe(true)
    const input = {
      currentUser: moderator,
      intakeId: intake.id,
      kind: 'supplement' as const,
      targetIds: [],
      structuredSubmission: { summary: 'A supplemental filing reviewed by staff.' },
      rationale: 'The filing was verified against the source email.',
      recommendationId: null,
      manualFallbackReason: 'The agent recommendation is still running.',
    }
    const before = await readCopyrightSupplementAdmissionState(noticeId, intake.id)
    const output = { summary: 'Agent output concurrent with staff admission.' }
    const race = await interleaveCopyrightOwnedRead({
      marker: 'admitCopyrightEmailCorrespondence:notice',
      ownedId: intake.id,
      first: () => admitCopyrightEmailCorrespondence(input),
      second: () =>
        appendCopyrightEmailIntakeRecommendation({
          intakeId: intake.id,
          inputSha256: Buffer.alloc(32, 6),
          promptVersion: 'test-concurrent-admission-v1',
          model: 'test-model',
          structuredOutput: output,
        }),
    })
    expect(race.observerErrors).toEqual([])
    expect(race.second).toEqual({ status: 'fulfilled', value: true })
    const after = await readCopyrightSupplementAdmissionState(noticeId, intake.id)
    const recommendationId = after.identities[0]
    const recommended = {
      ...before,
      recommendations: [
        {
          id: recommendationId,
          model: 'test-model',
          prompt_version: 'test-concurrent-admission-v1',
          digest: Buffer.alloc(32, 6).toString('hex'),
          output: JSON.stringify(output),
        },
      ],
      identities: [recommendationId],
      current: { id: recommendationId, output: JSON.stringify(output) },
    }
    const submissionId = after.submissions.find(row => row.kind === 'supplement')?.id
    const correspondenceId = after.correspondence.find(row => row.intake === intake.id)?.id
    const decision = {
      action: 'admitted',
      kind: 'supplement',
      submission: submissionId,
      correspondence: correspondenceId,
      actor: moderator.id,
      rationale: input.rationale,
      fallback: input.manualFallbackReason,
    }
    expect([
      {
        result: {
          status: 'rejected',
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Conflicting copyright case change',
          causeCode: '40001',
        },
        state: recommended,
      },
      {
        result: {
          status: 'fulfilled',
          value: { noticeId, submissionId, correspondenceId, isDuplicate: false },
        },
        state: {
          ...recommended,
          legal: {
            ...before.legal,
            pointers: [
              ...before.legal.pointers,
              { id: submissionId, assessment: null, compliant: null },
            ],
            events: [...before.legal.events, 'email_correspondence_admitted'].toSorted(),
            correspondence: [...before.legal.correspondence, 'inbound_message'].toSorted(),
          },
          submissions: [
            ...before.submissions,
            {
              id: submissionId,
              kind: 'supplement',
              source: 'email',
              actor: null,
              body: JSON.stringify(input.structuredSubmission),
            },
          ],
          correspondence: [
            ...before.correspondence,
            {
              id: correspondenceId,
              intake: intake.id,
              submission: submissionId,
              direction: 'inbound',
              kind: 'inbound_message',
            },
          ],
          evidence: [
            ...before.evidence,
            {
              submission: submissionId,
              storage: intake.raw_storage_object_id,
              digest: intake.raw_sha256.toString('hex'),
              media: 'message/rfc822',
              size: intake.raw_byte_size,
            },
          ],
          links: [{ link_kind: 'thread', ...decision }],
          reviews: [{ ...decision, recommendation: null }],
          clock: expect.any(Date),
        },
      },
    ]).toContainEqual({
      result: race.first.status === 'fulfilled' ? race.first : copyrightRaceResult(race.first),
      state: after,
    })
  })

  it('replays a separately committed supplement without changing any legal or recommendation state', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await createCopyrightNoticeForManualAssociation(false)
    const intake = await createParsedCopyrightEmailIntake()
    expect(
      await linkCopyrightEmailIntakeToNotice({ intakeId: intake.id, noticeId, linkKind: 'thread' }),
    ).toBe(true)
    const input = {
      currentUser: moderator,
      intakeId: intake.id,
      kind: 'supplement' as const,
      targetIds: [],
      structuredSubmission: { summary: 'Committed supplemental filing.' },
      rationale: 'Verified against the original email.',
      recommendationId: null,
      manualFallbackReason: 'No recommendation is available.',
    }
    const committed = await seedCommittedCopyrightSupplement(input)
    const before = await readCopyrightSupplementAdmissionState(noticeId, intake.id)
    await expect(admitCopyrightEmailCorrespondence(input)).resolves.toEqual({
      ...committed,
      isDuplicate: true,
    })
    expect(await readCopyrightSupplementAdmissionState(noticeId, intake.id)).toEqual(before)
  })
})
