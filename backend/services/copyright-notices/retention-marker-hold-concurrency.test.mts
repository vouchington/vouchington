import { describe, expect, it } from 'vitest'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { assertCopyrightMarkerHoldRace } from '@voucha/test-helpers/copyright-marker-hold-outcome'
import { createCopyrightMarkerHoldScene } from '@voucha/test-helpers/copyright-marker-hold-scene'
import {
  seedCopyrightCommittedAccountHold,
  readCopyrightAccountHoldRaceState,
} from '@voucha/test-helpers/copyright-account-hold-race-state'
import { destructiveHoldNow } from '@voucha/test-helpers/copyright-destructive-hold-scene'
import { releaseUserPreservationHold } from '../users/preservation-holds.mts'
import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const timings = ['marker', 'claim', 'proof', 'version_list', 'empty_version_list'] as const

describe('copyright retention marker preservation', () => {
  const bucket = useCopyrightEvidenceBucket()
  it.each(timings)(
    'couples hold admission after %s to complete marker, registry and provider state',
    async timing => {
      expect.hasAssertions()
      await assertCopyrightMarkerHoldRace(timing, bucket)
    },
  )

  it.each(['proof', 'empty_version_list'] as const)(
    'keeps committed preservation and resumes %s evidence after release',
    async timing => {
      const scene = await createCopyrightMarkerHoldScene(timing)
      const key = scene.key!
      const versions = timing === 'proof' ? 2 : 0
      if (versions > 0) await bucket.put(key, { versions })
      await seedCopyrightCommittedAccountHold(scene.admin, scene.party.id)
      const heldData = structuredClone(scene.data)
      const blocked = await runCopyrightCasePurgePage(scene.data, destructiveHoldNow)
      expect(blocked).toEqual({ data: heldData, hasMore: true, deferred: true })
      expect(await scene.readState()).toEqual(scene.before)
      expect(await bucket.countVersions(key)).toBe(versions)
      expect(
        (
          await runCopyrightAccountClockSyncPage({
            accountUserId: scene.party.id,
            afterNoticeId: null,
            sourceVersion: null,
          })
        ).hasMore,
      ).toBe(false)
      const settledHold = await readCopyrightAccountHoldRaceState(scene.party.id)
      expect(settledHold.pending).toBe(false)
      expect(settledHold.holds).toHaveLength(1)
      expect(settledHold.holds[0]?.released_at).toBeNull()
      const settledRows = await scene.readState()
      // A fresh phase probe avoids the intentional reset of the pre-sync proof.
      const freshData = { ...scene.data, proofVersion: null, legalClockAt: null }
      expect(await runCopyrightCasePurgePage(freshData, destructiveHoldNow)).toEqual({
        data: {
          ...freshData,
          phase: 'parties',
          phaseIndex: 0,
          afterId: null,
          childFrames: undefined,
          evidenceOwner: undefined,
          legalClockAt: expect.any(String),
          proofVersion: expect.any(String),
        },
        hasMore: true,
        deferred: true,
      })
      expect(freshData).toEqual({ ...heldData, proofVersion: null, legalClockAt: null })
      expect(await scene.readState()).toEqual(settledRows)
      expect(scene.data).toEqual(heldData)
      expect(await bucket.countVersions(key)).toBe(versions)
      await releaseUserPreservationHold(scene.admin, scene.party.id)
      expect(
        (
          await runCopyrightAccountClockSyncPage({
            accountUserId: scene.party.id,
            afterNoticeId: null,
            sourceVersion: null,
          })
        ).hasMore,
      ).toBe(false)
      // The supplied phase is a fresh caller-owned page; every live eligibility/preservation read still runs.
      const resumed = await runCopyrightCasePurgePage(
        { ...scene.data, proofVersion: null, legalClockAt: null },
        destructiveHoldNow,
      )
      expect(resumed).toMatchObject({ hasMore: true, data: { phase: 'evidence' } })
      expect(resumed.deferred).toBeUndefined()
      expect(await scene.readState()).toEqual({
        ...scene.before,
        clock: { ...scene.before.clock, last_legal_activity_at: expect.any(Date) },
        storage: null,
        aggregate: {
          ...scene.before.aggregate!,
          evidenceArtifacts: scene.before.aggregate!.evidenceArtifacts.map(row => ({
            ...row,
            storage_object_id: null,
          })),
        },
      })
      expect(await bucket.countVersions(key)).toBe(0)
    },
  )
})
