import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { copyrightNoticeExists } from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import {
  countMinimalProofCorrespondence,
  markMinimalProofCaseEvidenceErased,
  seedMinimalProofCorrespondenceFanout,
  selectMinimalProofChildPhase,
} from '@voucha/test-helpers/entities/copyright-minimal-blocker-proof'
import {
  addCopyrightAttemptsAfterLeafPhase,
  countRetainedMinimalParties,
  isErasedClaimantLinkNull,
  minimalPurgeWorkExists,
  placeErasedClaimantHold,
  readLateCopyrightAttemptsAndPhase,
  releaseErasedClaimantHold,
  seedAdvancedCopyrightParentPhase,
  seedFreshMinimalErasureMarker,
  seedLateCopyrightDeliveryParent,
} from '@voucha/test-helpers/entities/copyright-minimal-purge-fixture'
import { eraseCopyrightRetentionCase } from './retention-erasure-case.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge-case.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_1 } from './retention-minimal-purge-phases-1.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_2 } from './retention-minimal-purge-phases-2.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_3 } from './retention-minimal-purge-phases-3.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_4 } from './retention-minimal-purge-phases-4.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_5 } from './retention-minimal-purge-phases-5.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES } from './retention-minimal-purge-phases.mts'
import { cleanupCopyrightMinimalRecords } from '../data-retention/cleanup-copyright-minimal-records.mts'

describe('copyright minimal record clock', () => {
  it('does not restart the three-year clock when evidence erasure records a fresh marker', async () => {
    const fixture = await createRetentionMinimalCase()
    await seedFreshMinimalErasureMarker(fixture.noticeId)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2030-10-23T00:00:00Z'),
        cutoff: new Date('2027-10-23T00:00:00Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('purged')
  })

  it('honors a preservation hold placed for the claimant after evidence erased their live user link', async () => {
    const fixture = await createRetentionMinimalCase({ claimant: true })
    if (!fixture.claimantId) throw new Error('signed-in claimant fixture missing')
    await expect(
      eraseCopyrightRetentionCase(fixture.noticeId, {
        now: new Date('2030-10-23T00:00:00Z'),
        cutoff: new Date('2027-10-23T00:00:00Z'),
        retentionDays: 1095,
      }),
    ).resolves.toBe('erased')
    expect(await isErasedClaimantLinkNull(fixture.noticeId)).toBe(true)
    await placeErasedClaimantHold(fixture.claimantId, fixture.moderator.id)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2035-10-23T00:00:00Z'),
        cutoff: new Date('2032-10-23T00:00:00Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('ineligible')
    await releaseErasedClaimantHold(fixture.claimantId, fixture.moderator.id)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2034-10-22T23:59:59Z'),
        cutoff: new Date('2031-10-22T23:59:59Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('ineligible')
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2034-10-23T00:00:00Z'),
        cutoff: new Date('2031-10-23T00:00:00Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('purged')
  })

  it('resumes capped child pages and drains retained party links after the root is gone', async () => {
    const fixture = await createRetentionMinimalCase({ claimant: true })
    await expect(
      eraseCopyrightRetentionCase(fixture.noticeId, {
        now: new Date('2030-10-23T00:00:00Z'),
        cutoff: new Date('2027-10-23T00:00:00Z'),
        retentionDays: 1095,
      }),
    ).resolves.toBe('erased')
    const options = { now: new Date('2030-10-23T00:00:00Z'), noticeIds: [fixture.noticeId] }
    const first = await cleanupCopyrightMinimalRecords({ batchSize: 1, maxBatches: 1 }, options)
    expect(first.progressed).toBe(1)
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(true)
    const proofPage = await cleanupCopyrightMinimalRecords(
      { batchSize: 50, maxBatches: 16 },
      options,
    )
    expect(proofPage.progressed).toBe(1)
    const resumed = await cleanupCopyrightMinimalRecords({ batchSize: 50, maxBatches: 16 }, options)
    const completed = await cleanupCopyrightMinimalRecords(
      { batchSize: 50, maxBatches: 16 },
      options,
    )
    expect(resumed.purged + completed.purged).toBe(1)
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(false)
    expect(await countRetainedMinimalParties(fixture.noticeId)).toBe(0)
    expect(await minimalPurgeWorkExists(fixture.noticeId)).toBe(false)
  })

  it('deletes at most one child page when a case has many correspondence rows', async () => {
    const fixture = await createRetentionMinimalCase()
    await seedMinimalProofCorrespondenceFanout(fixture.noticeId)
    await markMinimalProofCaseEvidenceErased(fixture.noticeId)
    // Finish the bounded proof under an intentionally too-young cutoff before
    // measuring the first physical child page.
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2030-10-23T00:00:00Z'),
        cutoff: new Date('2020-10-23T00:00:00Z'),
        maxBatches: 16,
      }),
    ).resolves.toBe('ineligible')
    const correspondencePhase = COPYRIGHT_MINIMAL_PURGE_PHASES.findIndex(
      phase => phase.table === 'copyright_notice_correspondence_messages',
    )
    expect(correspondencePhase).toBeGreaterThan(0)
    // Isolate this durable phase so the fixture's earlier target and lifecycle
    // leaves do not consume the single page whose row cap is under test.
    await selectMinimalProofChildPhase(fixture.noticeId, correspondencePhase)
    const options = {
      now: new Date('2030-10-23T00:00:00Z'),
      cutoff: new Date('2027-10-23T00:00:00Z'),
      pageSize: 10,
      maxBatches: 1,
    }
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    expect(await countMinimalProofCorrespondence(fixture.noticeId)).toBe(45)
    await selectMinimalProofChildPhase(fixture.noticeId, 0)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        ...options,
        maxBatches: 16,
      }),
    ).resolves.toBe('purged')
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(false)
  })

  it('restarts an advanced parent phase when a late child has more than one page', async () => {
    const fixture = await createRetentionMinimalCase()
    const parentPhase =
      COPYRIGHT_MINIMAL_PURGE_PHASES_1.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_2.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_3.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_4.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_5.findIndex(
        phase => phase.table === 'copyright_notice_delivery_work_items',
      )
    expect(parentPhase).toBeGreaterThan(0)
    const intentId = await seedLateCopyrightDeliveryParent(fixture.noticeId)
    await markMinimalProofCaseEvidenceErased(fixture.noticeId)
    // Model a durable checkpoint immediately after the attempt phase. The
    // actual purge runner must refuse to cascade the subsequently added rows.
    await seedAdvancedCopyrightParentPhase(fixture.noticeId, parentPhase)
    await addCopyrightAttemptsAfterLeafPhase(intentId)
    const options = {
      now: new Date('2030-10-23T00:00:00Z'),
      cutoff: new Date('2027-10-23T00:00:00Z'),
      pageSize: 10,
      maxBatches: 1,
    }
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    expect(await readLateCopyrightAttemptsAndPhase(fixture.noticeId, intentId)).toEqual({
      count: 55,
      phase_index: 0,
    })
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, { ...options, maxBatches: 100 }),
    ).resolves.toBe('purged')
  })
})
