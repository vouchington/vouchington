import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'
import { afterS3ImagesClientVersionListForTest } from '@voucha/test-helpers/s3-images-client-injection'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { addRetentionArtifact } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  holdCopyrightCaseAfterPurgeProof,
  readCopyrightStorageClaimProof,
} from '@voucha/test-helpers/copyright-case-hold-interleave'
import {
  createCopyrightNoticeForManualAssociation,
  isTestCopyrightCaseEvidenceErased,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { addCopyrightCasePurgeFixtureParty } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../users/preservation-holds.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const purgeNow = new Date('2100-01-01T12:00:00.000Z')

describe('copyright retention marker preservation', () => {
  const bucket = useCopyrightEvidenceBucket()
  it('does not mark evidence erased when an account hold commits after the proof read', async () => {
    const admin = await createTestUser({ administrator: true })
    const party = await createTestUser()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
    const first = await runCopyrightCasePurgePage(
      {
        noticeId,
        phase: 'parties',
        phaseIndex: 0,
        afterId: null,
        legalClockAt: null,
        proofVersion: null,
      },
      purgeNow,
    )
    let holdPlaced = false
    try {
      const page = await holdCopyrightCaseAfterPurgeProof(
        noticeId,
        async () => {
          await placeUserPreservationHold(admin, party.id, 'committed-before-copyright-marker')
          holdPlaced = true
        },
        () =>
          runCopyrightCasePurgePage({ ...first.data, phase: 'evidence', phaseIndex: 2 }, purgeNow),
      )
      expect(page).toMatchObject({ hasMore: true, deferred: true, data: { phase: 'parties' } })
      expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(false)
    } finally {
      if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
    }
  })
  it('does not claim physical deletion when an account hold commits after the proof read', async () => {
    const admin = await createTestUser({ administrator: true })
    const party = await createTestUser()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: admin.id,
      receivedAt: new Date(),
      bodyCiphertext: 'owned-retention-evidence',
    })
    const key = await addRetentionArtifact(submission.id)
    const proof = await readCopyrightStorageClaimProof(key)
    const first = await runCopyrightCasePurgePage(
      {
        noticeId,
        phase: 'parties',
        phaseIndex: 0,
        afterId: null,
        legalClockAt: null,
        proofVersion: null,
      },
      purgeNow,
    )
    let holdPlaced = false
    try {
      const page = await holdCopyrightCaseAfterPurgeProof(
        noticeId,
        async () => {
          await placeUserPreservationHold(admin, party.id, 'committed-before-object-deletion-claim')
          holdPlaced = true
        },
        () =>
          runCopyrightCasePurgePage(
            {
              ...first.data,
              phase: 'evidence',
              phaseIndex: 0,
              evidenceOwner: {
                objectId: proof.id,
                generation: proof.generation,
                family: 'intakes',
                afterId: null,
              },
            },
            purgeNow,
          ),
      )
      expect(page).toMatchObject({ hasMore: true, deferred: true, data: { phase: 'parties' } })
      expect((await readCopyrightStorageClaimProof(key)).claimed).toBe(false)
      expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(false)
    } finally {
      if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
    }
  })
  it.each(['proof', 'version_list', 'empty_version_list'] as const)(
    'does not delete claimed evidence when an account hold commits after %s',
    async timing => {
      const admin = await createTestUser({ administrator: true })
      const party = await createTestUser()
      const noticeId = await createCopyrightNoticeForManualAssociation()
      await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
      const submission = await appendTestCopyrightNoticeSubmission({
        noticeId,
        kind: 'notice',
        sourceKind: 'staff',
        submittedByUserId: admin.id,
        receivedAt: new Date(),
        bodyCiphertext: 'owned-claimed-retention-evidence',
      })
      const key = await addRetentionArtifact(submission.id)
      const versions = timing === 'empty_version_list' ? 0 : 2
      if (versions > 0) await bucket.put(key, { versions })
      const proof = await readCopyrightStorageClaimProof(key)
      const first = await runCopyrightCasePurgePage(
        {
          noticeId,
          phase: 'parties',
          phaseIndex: 0,
          afterId: null,
          legalClockAt: null,
          proofVersion: null,
        },
        purgeNow,
      )
      const claimed = await runCopyrightCasePurgePage(
        {
          ...first.data,
          phase: 'evidence',
          phaseIndex: 0,
          evidenceOwner: {
            objectId: proof.id,
            generation: proof.generation,
            family: 'intakes',
            afterId: null,
          },
        },
        purgeNow,
      )
      expect((await readCopyrightStorageClaimProof(key)).claimed).toBe(true)
      const artifactsBefore = (await getCopyrightNoticePrivateAggregate(noticeId))!
        .evidenceArtifacts
      let holdPlaced = false
      try {
        const placeHold = async () => {
          await placeUserPreservationHold(admin, party.id, 'committed-before-physical-deletion')
          holdPlaced = true
        }
        const observation =
          timing !== 'proof'
            ? afterS3ImagesClientVersionListForTest(bucket.name(), key, placeHold)
            : undefined
        const page =
          timing === 'proof'
            ? await holdCopyrightCaseAfterPurgeProof(noticeId, placeHold, () =>
                runCopyrightCasePurgePage(claimed.data, purgeNow),
              )
            : await runCopyrightCasePurgePage(claimed.data, purgeNow)
        expect(holdPlaced).toBe(true)
        expect(page).toMatchObject({ hasMore: true, deferred: true, data: { phase: 'parties' } })
        expect(await bucket.countVersions(key)).toBe(versions)
        expect(await isTestCopyrightCaseEvidenceErased(noticeId)).toBe(false)
        expect((await readCopyrightStorageClaimProof(key)).claimed).toBe(true)
        expect((await getCopyrightNoticePrivateAggregate(noticeId))!.evidenceArtifacts).toEqual(
          artifactsBefore,
        )
        expect(observation?.deleteCalls() ?? 0).toBe(0)
        await releaseUserPreservationHold(admin, party.id)
        holdPlaced = false
        const synced = await runCopyrightAccountClockSyncPage({
          accountUserId: party.id,
          afterNoticeId: null,
          sourceVersion: null,
        })
        expect(synced.hasMore).toBe(false)
        const resumed = await runCopyrightCasePurgePage(page.data, purgeNow)
        expect(resumed.hasMore).toBe(true)
        expect(resumed.deferred).toBeUndefined()
      } finally {
        if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
      }
    },
  )
})
