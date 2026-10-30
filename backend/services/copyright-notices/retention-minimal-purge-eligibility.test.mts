import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import {
  copyrightNoticeExists,
  isMinimalPurgeEligible,
} from '@voucha/test-helpers/entities/copyright-minimal-account-clock'
import { readCopyrightRetentionMarker } from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import {
  countMinimalProofCorrespondence,
  seedMinimalProofCorrespondenceFanout,
  selectMinimalProofChildPhase,
} from '@voucha/test-helpers/entities/copyright-minimal-blocker-proof'
import {
  addCopyrightAttemptsAfterLeafPhase,
  attemptTestCopyrightLifecycleChangeDelete,
  attemptTestCopyrightLifecycleChangeUpdate,
  countRetainedMinimalParties,
  isErasedClaimantLinkNull,
  minimalPurgeWorkExists,
  placeErasedClaimantHold,
  readLateCopyrightAttemptsAndPhase,
  readTestCopyrightLifecycleChangeId,
  releaseErasedClaimantHold,
  seedLateCopyrightDeliveryParent,
} from '@voucha/test-helpers/entities/copyright-minimal-purge-fixture'
import {
  advanceCopyrightRetentionWorkPages,
  setCopyrightMinimalPurgePhaseForRetentionTest,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { purgeCopyrightMinimalRecord } from '@voucha/test-helpers/copyright-minimal-purge'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_1 } from './retention-minimal-purge-phases-1.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_2 } from './retention-minimal-purge-phases-2.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_3 } from './retention-minimal-purge-phases-3.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_4 } from './retention-minimal-purge-phases-4.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES_5 } from './retention-minimal-purge-phases-5.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES } from './retention-minimal-purge-phases.mts'
import { cleanupCopyrightMinimalRecords } from '../data-retention/cleanup-copyright-minimal-records.mts'

describe('copyright minimal record clock', () => {
  const setClock = useCopyrightRetentionWorkClock()

  it('does not restart the six-year clock when staged evidence erasure records a fresh marker', async () => {
    await setClock(new Date('2029-10-23T00:00:00Z'))
    const fixture = await createRetentionMinimalCase()
    const eventId = await readTestCopyrightLifecycleChangeId(fixture.noticeId)
    await expect(attemptTestCopyrightLifecycleChangeUpdate(eventId)).rejects.toThrow(
      'copyright legal records are immutable outside a case purge',
    )
    await expect(attemptTestCopyrightLifecycleChangeDelete(eventId)).rejects.toThrow(
      'copyright legal records are immutable outside a case purge',
    )
    await setClock(new Date('2035-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
    expect(
      await isMinimalPurgeEligible(
        fixture.noticeId,
        new Date('2035-10-22T23:59:59Z'),
        new Date('2029-10-22T23:59:59Z'),
      ),
    ).toBe(false)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2035-10-23T00:00:00Z'),
        cutoff: new Date('2029-10-23T00:00:00Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('purged')
  })

  it('honors a preservation hold placed for the claimant after evidence erased their live user link', async () => {
    await setClock(new Date('2029-10-23T00:00:00Z'))
    const fixture = await createRetentionMinimalCase({ claimant: true })
    if (!fixture.claimantId) throw new Error('signed-in claimant fixture missing')
    await setClock(new Date('2035-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
    expect(await isErasedClaimantLinkNull(fixture.noticeId)).toBe(true)
    await placeErasedClaimantHold(fixture.claimantId, fixture.moderator.id)
    await setClock(new Date('2040-10-23T00:00:00Z'))
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2040-10-23T00:00:00Z'),
        cutoff: new Date('2034-10-23T00:00:00Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('ineligible')
    const releasedAt = new Date('2040-10-23T00:00:00Z')
    await releaseErasedClaimantHold(fixture.claimantId, fixture.moderator.id, releasedAt)
    await setClock(new Date('2046-10-22T23:59:59.999Z'))
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2046-10-22T23:59:59.999Z'),
        cutoff: new Date('2040-10-22T23:59:59.999Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('ineligible')
    await setClock(new Date('2046-10-23T00:00:00Z'))
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2046-10-23T00:00:00Z'),
        cutoff: new Date('2040-10-23T00:00:00Z'),
        maxBatches: 100,
      }),
    ).resolves.toBe('purged')
  })

  it('resumes capped child pages and drains retained party links after the root is gone', async () => {
    await setClock(new Date('2029-10-23T00:00:00Z'))
    const fixture = await createRetentionMinimalCase({ claimant: true })
    await setClock(new Date('2035-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
    const options = { now: new Date('2035-10-23T00:00:00Z'), noticeIds: [fixture.noticeId] }
    const first = await cleanupCopyrightMinimalRecords({ batchSize: 1, maxBatches: 1 }, options)
    expect(first.progressed).toBe(1)
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(true)
    const proofPage = await cleanupCopyrightMinimalRecords(
      { batchSize: 50, maxBatches: 16 },
      options,
    )
    expect(proofPage.progressed + proofPage.purged).toBe(1)
    const resumed = await cleanupCopyrightMinimalRecords({ batchSize: 50, maxBatches: 16 }, options)
    const completed = await cleanupCopyrightMinimalRecords(
      { batchSize: 50, maxBatches: 16 },
      options,
    )
    expect(proofPage.purged + resumed.purged + completed.purged).toBe(1)
    expect(await copyrightNoticeExists(fixture.noticeId)).toBe(false)
    expect(await countRetainedMinimalParties(fixture.noticeId)).toBe(0)
    expect(await minimalPurgeWorkExists(fixture.noticeId)).toBe(false)
  })

  it('deletes at most one child page when a case has many correspondence rows', async () => {
    await setClock(new Date('2029-10-23T00:00:00Z'))
    const fixture = await createRetentionMinimalCase()
    await seedMinimalProofCorrespondenceFanout(fixture.noticeId)
    await setClock(new Date('2035-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
    // Finish the bounded proof under an intentionally too-young cutoff before
    // measuring the first physical child page.
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2035-10-23T00:00:00Z'),
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
      now: new Date('2035-10-23T00:00:00Z'),
      cutoff: new Date('2029-10-23T00:00:00Z'),
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
    await setClock(new Date('2029-10-23T00:00:00Z'))
    const fixture = await createRetentionMinimalCase()
    const intentId = await seedLateCopyrightDeliveryParent(fixture.noticeId)
    await setClock(new Date('2035-10-23T00:00:00Z'))
    const erasurePages = await advanceCopyrightRetentionWorkPages(fixture.noticeId)
    expect(erasurePages).toContain('erased')
    await expect(readCopyrightRetentionMarker(fixture.noticeId)).resolves.not.toBeNull()
    const parentPhase =
      COPYRIGHT_MINIMAL_PURGE_PHASES_1.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_2.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_3.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_4.length +
      COPYRIGHT_MINIMAL_PURGE_PHASES_5.findIndex(
        phase => phase.table === 'copyright_notice_delivery_work_items',
      )
    expect(parentPhase).toBeGreaterThan(0)
    // Model a durable checkpoint immediately after the attempt phase. The
    // actual purge runner must refuse to cascade the subsequently added rows.
    await setCopyrightMinimalPurgePhaseForRetentionTest(fixture.noticeId, parentPhase)
    await addCopyrightAttemptsAfterLeafPhase(intentId)
    const options = {
      now: new Date('2035-10-23T00:00:00Z'),
      cutoff: new Date('2029-10-23T00:00:00Z'),
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
