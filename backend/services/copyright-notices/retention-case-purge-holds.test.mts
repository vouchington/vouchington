import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { afterCopyrightHoldCoverage } from '@voucha/test-helpers/copyright-preservation-coverage-interleave'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
} from '@voucha/test-helpers/copyright-email-manual-association'
import {
  appendTestCopyrightNoticeSubmission,
  seedCopyrightSubmissionAssessment,
} from '@voucha/test-helpers/copyright-notice-submissions'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { COPYRIGHT_CASE_PURGE_PHASES } from '@data-stores/psql/copyright-case-purge-order'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  addCopyrightCasePurgeFixtureParty,
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  settleCopyrightCasePurgeFixtureActions,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
  getUserPreservationHoldState,
} from '../users/preservation-holds.mts'
import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'
import {
  placeCopyrightCasePreservationHold,
  releaseCopyrightCasePreservationHold,
} from './retention-review-closures.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

// PostgreSQL fixtures use clock_timestamp(), so only the service's injected clock moves forward.
const PURGE_NOW = new Date('2100-01-01T12:00:00.000Z')

function firstPage(noticeId: string): CopyrightCasePurgeJobData {
  return {
    noticeId,
    phase: 'parties',
    phaseIndex: 0,
    afterId: null,
    legalClockAt: null,
    proofVersion: null,
  }
}

const pageSize = 1

describe('copyright case purge holds placed mid-purge', () => {
  const bucket = useCopyrightEvidenceBucket()

  it('keeps the exact child-page or preservation-hold result without partial state', async () => {
    const admin = await createTestUser({ administrator: true, extraRoles: ['moderator'] })
    const party = await createTestUser()
    const noticeId = await createCopyrightNoticeForManualAssociation()
    await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: admin.id,
      receivedAt: new Date(),
      bodyCiphertext: 'First committed child purge.',
    })
    await seedCopyrightSubmissionAssessment({
      submissionId: submission.id,
      currentUser: admin,
      assessedAt: new Date(),
      substantiallyCompliant: true,
    })
    await markTestCopyrightNoticeErasedAndCommit(noticeId)
    const first = await runCopyrightCasePurgePage(firstPage(noticeId), PURGE_NOW, 100)
    const phaseIndex = COPYRIGHT_CASE_PURGE_PHASES.findIndex(
      phase => phase[0] === 'copyright_notice_lifecycle_changes',
    )
    expect(
      (await getCopyrightNoticePrivateAggregate(noticeId))!.lifecycleEvents.length,
    ).toBeGreaterThan(0)
    const beforeEvents = (await getCopyrightNoticePrivateAggregate(noticeId))!.lifecycleEvents
    let pageOutcome: unknown
    let holdPlaced = false
    try {
      const holdOutcome = await afterCopyrightHoldCoverage(
        noticeId,
        async () => {
          pageOutcome = await runCopyrightCasePurgePage(
            { ...first.data, phase: 'children', phaseIndex, afterId: null },
            PURGE_NOW,
            100,
          )
            .then(value => ({ status: 'fulfilled', value }))
            .catch((err: unknown) => ({ status: 'rejected', reason: err }))
        },
        async () => {
          const result = await placeUserPreservationHold(
            admin,
            party.id,
            'hold-overlaps-child-page',
          )
          holdPlaced = true
          return result
        },
      )
        .then(value => ({ status: 'fulfilled', value }))
        .catch((err: unknown) => ({ status: 'rejected', reason: err }))
      const native = expect.objectContaining({ code: '40001' })
      const holdAbort = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409, code: 'CONFLICT', cause: native }),
      })
      const pageAbort = expect.objectContaining({ status: 'rejected', reason: native })
      expect([
        {
          hold: holdAbort,
          page: expect.objectContaining({
            status: 'fulfilled',
            value: expect.objectContaining({
              hasMore: true,
              data: expect.objectContaining({ phase: 'children', phaseIndex: phaseIndex + 1 }),
            }),
          }),
          events: [],
          holds: 0,
        },
        {
          hold: expect.objectContaining({ status: 'fulfilled' }),
          page: pageAbort,
          events: beforeEvents,
          holds: 1,
        },
        { hold: holdAbort, page: pageAbort, events: beforeEvents, holds: 0 },
      ]).toContainEqual({
        hold: holdOutcome,
        page: pageOutcome,
        events: (await getCopyrightNoticePrivateAggregate(noticeId))!.lifecycleEvents,
        holds: (await getUserPreservationHoldState(admin, party.id)).holds.length,
      })
    } finally {
      if (holdPlaced) await releaseUserPreservationHold(admin, party.id)
    }
  })

  // no-mistakes-timeout-reason: reviewed email fixture and bounded PostgreSQL purge pages
  it('defers while a party account hold waits for its clock sync, then stops on the hold', async () => {
    const [admin, entry] = await Promise.all([
      createTestUser({ administrator: true }),
      createRetentionMinimalCase({
        artifacts: 1,
        sourceKind: 'email',
        substantiallyCompliant: false,
      }),
    ])
    await addCopyrightCasePurgeFixtureParty(entry.noticeId, entry.posterId)
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    const first = await runCopyrightCasePurgePage(firstPage(entry.noticeId), PURGE_NOW, pageSize)
    expect(first.hasMore).toBe(true)

    await placeUserPreservationHold(admin, entry.posterId, 'party-hold-during-purge')
    onTestFinished(async () => {
      await releaseUserPreservationHold(admin, entry.posterId)
    })
    const deferred = await runCopyrightCasePurgePage(first.data, PURGE_NOW, pageSize)
    expect(deferred).toMatchObject({ hasMore: true, deferred: true })
    expect(deferred.data).toEqual(first.data)

    let sync = await runCopyrightAccountClockSyncPage(
      {
        accountUserId: entry.posterId,
        afterNoticeId: null,
        sourceVersion: null,
      },
      pageSize,
    )
    for (let step = 0; step < 20 && sync.hasMore; step += 1)
      sync = await runCopyrightAccountClockSyncPage(sync.data, pageSize)
    expect(sync.hasMore).toBe(false)
    let data = deferred.data
    let page = await runCopyrightCasePurgePage(data, PURGE_NOW, pageSize)
    for (let step = 0; step < 200 && page.hasMore; step += 1) {
      data = page.data
      page = await runCopyrightCasePurgePage(data, PURGE_NOW, pageSize)
    }
    expect(page.hasMore).toBe(false)
    expect(await readCopyrightCasePurgeFixture(entry.noticeId)).toMatchObject({ live: true })
  }, 30_000)

  // no-mistakes-timeout-reason: reviewed email fixture, emulator evidence bucket, and bounded pages
  it('stops a purge whose case hold lands after evidence erasure started', async () => {
    const entry = await createRetentionMinimalCase({
      artifacts: 1,
      sourceKind: 'email',
      substantiallyCompliant: false,
    })
    await settleCopyrightCasePurgeFixtureActions(entry.noticeId)
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    for (const key of entry.evidenceKeys) await bucket.put(key, { versions: 3, deleteMarker: true })
    let data = firstPage(entry.noticeId)
    for (let step = 0; step < 1_000 && data.phase !== 'evidence'; step += 1) {
      const page = await runCopyrightCasePurgePage(data, PURGE_NOW, pageSize)
      expect(page.hasMore).toBe(true)
      data = page.data
    }
    expect(data.phase).toBe('evidence')
    const started = await runCopyrightCasePurgePage(data, PURGE_NOW, pageSize)
    expect(started.hasMore).toBe(true)
    const versionsBeforeHold = await Promise.all(entry.evidenceKeys.map(bucket.countVersions))
    // The started page erased part of the evidence; the rest must survive the hold.
    expect(versionsBeforeHold.reduce((total, count) => total + count)).toBeGreaterThan(0)

    const hold = await placeCopyrightCasePreservationHold(
      entry.moderator,
      entry.noticeId,
      'litigation_threat',
    )
    onTestFinished(async () => {
      await releaseCopyrightCasePreservationHold(entry.moderator, entry.noticeId, hold.id)
    })
    const stopped = await runCopyrightCasePurgePage(started.data, PURGE_NOW, pageSize)
    expect(stopped.hasMore).toBe(false)
    expect(await Promise.all(entry.evidenceKeys.map(bucket.countVersions))).toEqual(
      versionsBeforeHold,
    )
    expect(await readCopyrightCasePurgeFixture(entry.noticeId)).toMatchObject({ live: true })
  }, 30_000)
})
