import {
  clearCopyrightEvidenceRetentionPolicy,
  insertApprovedCopyrightEvidenceRetentionPolicy,
  insertUnresolvedCopyrightLegalHold,
  readCopyrightEvidenceStorageKey,
  readCopyrightNoticeSubmissionId,
  setCopyrightEvidenceRetentionGate,
} from '@voucha/test-helpers/data-stores/psql/copyright-evidence-retention'
import { insertGuestLifecycleCounterDeadline } from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import assert from 'node:assert'
import { describe, expect, it } from 'vitest'
import {
  appendCopyrightEvidenceArtifact,
  closeCopyrightNoticeCase,
  createCopyrightNoticeAggregate,
  previewCopyrightEvidenceRetention,
  recordCopyrightEvidenceRetentionDisposition,
} from './index.mts'

async function openNotice() {
  const owner = await createTestUserDirect()
  const imageId = await insertTestImage(owner.id)
  const postId = await insertTestPost({
    title: `retention ${crypto.randomUUID()}`,
    slug: `retention-${crypto.randomUUID()}`,
    createdById: owner.id,
    markdown: 'image',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  assert(placement)
  const receivedAt = new Date('2026-07-01T12:00:00.000Z')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt,
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'staff',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return { notice, receivedAt }
}

describe('copyright evidence retention preview', () => {
  it('refuses every open ground and leaves the evidence object in place', async () => {
    const { notice, receivedAt } = await openNotice()
    const staff = await createTestUserDirect({ administrator: true })
    const submissionId = await readCopyrightNoticeSubmissionId(notice.id)
    const storageKey = `evidence/${crypto.randomUUID()}`
    const artifact = await appendCopyrightEvidenceArtifact({
      submissionId,
      storageKey,
      sha256: Buffer.alloc(32, 7),
      mimeType: 'application/pdf',
      byteSize: 12,
    })
    await insertGuestLifecycleCounterDeadline({
      noticeId: notice.id,
      receivedAt,
      actorId: staff.id,
      bodyCiphertext: `counter-${crypto.randomUUID()}`,
      earliestRestorationAt: new Date('2026-07-20T00:00:00.000Z'),
      escalationAt: new Date('2026-07-21T00:00:00.000Z'),
      restorationDeadlineAt: new Date('2026-07-22T00:00:00.000Z'),
    })
    await insertUnresolvedCopyrightLegalHold({
      submissionId,
      assessedAt: receivedAt,
      assessedById: staff.id,
      rationaleCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const preview = await previewCopyrightEvidenceRetention(notice.id)
    expect(preview.eligible).toBe(false)
    expect(preview.reasons).toEqual([
      'gate_disabled',
      'policy_unapproved',
      'case_open',
      'legal_hold',
      'open_deadline',
    ])
    expect(preview.evidenceArtifactIds).toEqual([artifact.id])
    expect(JSON.stringify(preview)).not.toContain(storageKey)
    const disposition = await recordCopyrightEvidenceRetentionDisposition(preview.id)
    expect(disposition.outcome).toBe('refused')
    const again = await recordCopyrightEvidenceRetentionDisposition(preview.id)
    expect(again).toEqual(disposition)
    expect(await readCopyrightEvidenceStorageKey(artifact.id)).toBe(storageKey)
  })

  it('records not_destroyed when the case is clear and still keeps the object', async () => {
    const { notice } = await openNotice()
    const staff = await createTestUserDirect({ administrator: true })
    const submissionId = await readCopyrightNoticeSubmissionId(notice.id)
    const storageKey = `evidence/${crypto.randomUUID()}`
    const artifact = await appendCopyrightEvidenceArtifact({
      submissionId,
      storageKey,
      sha256: Buffer.alloc(32, 9),
      mimeType: 'application/pdf',
      byteSize: 4,
    })
    await setCopyrightEvidenceRetentionGate(true)
    const policyId = await insertApprovedCopyrightEvidenceRetentionPolicy({
      approvedAt: new Date('2026-08-01T00:00:00.000Z'),
      approvedByUserId: staff.id,
    })
    try {
      await closeCopyrightNoticeCase({
        currentUser: staff,
        noticeId: notice.id,
        closedAt: new Date('2026-08-02T00:00:00.000Z'),
      })
      const preview = await previewCopyrightEvidenceRetention(notice.id)
      expect(preview).toMatchObject({
        eligible: true,
        reasons: [],
        evidenceArtifactIds: [artifact.id],
      })
      const disposition = await recordCopyrightEvidenceRetentionDisposition(preview.id)
      expect(disposition.outcome).toBe('not_destroyed')
      expect(await readCopyrightEvidenceStorageKey(artifact.id)).toBe(storageKey)
    } finally {
      await clearCopyrightEvidenceRetentionPolicy(policyId)
      await setCopyrightEvidenceRetentionGate(false)
    }
  })

  it('rejects case closure from a user who cannot review copyright notices', async () => {
    const { notice } = await openNotice()
    const outsider = await createTestUserDirect()
    await expect(
      closeCopyrightNoticeCase({
        currentUser: outsider,
        noticeId: notice.id,
        closedAt: new Date('2026-08-02T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
