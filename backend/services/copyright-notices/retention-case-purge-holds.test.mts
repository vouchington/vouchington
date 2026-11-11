import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import {
  addCopyrightCasePurgeFixtureParty,
  publishCopyrightCasePurgeCoverage,
  readCopyrightCasePurgeFixture,
  settleCopyrightCasePurgeFixtureActions,
  useCopyrightCasePurgePageSize,
} from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { placeUserPreservationHold } from '../users/preservation-holds.mts'
import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'
import { placeCopyrightCasePreservationHold } from './retention-review-closures.mts'
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

describe('copyright case purge holds placed mid-purge', () => {
  useAutomaticProvisionalWithholding()
  const bucket = useCopyrightEvidenceBucket()
  const setPageSize = useCopyrightCasePurgePageSize()

  // no-mistakes-timeout-reason: reviewed email fixture and bounded PostgreSQL purge pages
  it('defers while a party account hold waits for its clock sync, then stops on the hold', async () => {
    await setPageSize(1)
    const [admin, entry] = await Promise.all([
      createTestUser({ administrator: true }),
      createRetentionEmailCase(),
    ])
    await addCopyrightCasePurgeFixtureParty(entry.noticeId, entry.posterId)
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    const first = await runCopyrightCasePurgePage(firstPage(entry.noticeId), PURGE_NOW)
    expect(first.hasMore).toBe(true)

    await placeUserPreservationHold(admin, entry.posterId, 'party-hold-during-purge')
    const deferred = await runCopyrightCasePurgePage(first.data, PURGE_NOW)
    expect(deferred).toMatchObject({ hasMore: true, deferred: true })
    expect(deferred.data).toEqual(first.data)

    let sync = await runCopyrightAccountClockSyncPage({
      accountUserId: entry.posterId,
      afterNoticeId: null,
      sourceVersion: null,
    })
    for (let step = 0; step < 20 && sync.hasMore; step += 1)
      sync = await runCopyrightAccountClockSyncPage(sync.data)
    expect(sync.hasMore).toBe(false)
    let data = deferred.data
    let page = await runCopyrightCasePurgePage(data, PURGE_NOW)
    for (let step = 0; step < 200 && page.hasMore; step += 1) {
      data = page.data
      page = await runCopyrightCasePurgePage(data, PURGE_NOW)
    }
    expect(page.hasMore).toBe(false)
    expect(await readCopyrightCasePurgeFixture(entry.noticeId)).toMatchObject({ live: true })
  }, 30_000)

  // no-mistakes-timeout-reason: reviewed email fixture, emulator evidence bucket, and bounded pages
  it('stops a purge whose case hold lands after evidence erasure started', async () => {
    await setPageSize(1)
    const entry = await createRetentionEmailCase()
    await settleCopyrightCasePurgeFixtureActions(entry.noticeId)
    await publishCopyrightCasePurgeCoverage(entry.noticeId)
    for (const key of entry.evidenceKeys) await bucket.put(key, { versions: 3, deleteMarker: true })
    let data = firstPage(entry.noticeId)
    for (let step = 0; step < 1_000 && data.phase !== 'evidence'; step += 1) {
      const page = await runCopyrightCasePurgePage(data, PURGE_NOW)
      expect(page.hasMore).toBe(true)
      data = page.data
    }
    expect(data.phase).toBe('evidence')
    const started = await runCopyrightCasePurgePage(data, PURGE_NOW)
    expect(started.hasMore).toBe(true)
    const versionsBeforeHold = await Promise.all(entry.evidenceKeys.map(bucket.countVersions))
    // The started page erased part of the evidence; the rest must survive the hold.
    expect(versionsBeforeHold.reduce((total, count) => total + count)).toBeGreaterThan(0)

    await placeCopyrightCasePreservationHold(entry.moderator, entry.noticeId, 'litigation_threat')
    const stopped = await runCopyrightCasePurgePage(started.data, PURGE_NOW)
    expect(stopped.hasMore).toBe(false)
    expect(await Promise.all(entry.evidenceKeys.map(bucket.countVersions))).toEqual(
      versionsBeforeHold,
    )
    expect(await readCopyrightCasePurgeFixture(entry.noticeId)).toMatchObject({ live: true })
  }, 30_000)
})
