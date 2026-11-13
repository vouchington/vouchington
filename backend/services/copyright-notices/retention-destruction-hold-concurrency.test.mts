import { runCopyrightAccountClockSyncPage } from './retention-account-clock-sync.mts'
import { describe, expect, it } from 'vitest'
import {
  createCopyrightDestructiveHoldScene,
  destructiveHoldNow,
} from '@voucha/test-helpers/copyright-destructive-hold-scene'
import { interleaveCopyrightOwnedRead } from '@voucha/test-helpers/copyright-owned-read-interleave'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import {
  copyrightAccountHoldConflict,
  readCopyrightAccountHoldRaceState,
  seedCopyrightCommittedAccountHold,
} from '@voucha/test-helpers/copyright-account-hold-race-state'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../users/preservation-holds.mts'
import { runCopyrightCasePurgePage } from './retention-case-purge-page.mts'

const families = ['lifecycle', 'nested', 'pointers', 'children', 'email_links', 'final'] as const

describe('account preservation at destructive copyright page admission', () => {
  it.each(families)(
    'publishes only a complete %s page or a complete preservation hold',
    async branch => {
      const scene = await createCopyrightDestructiveHoldScene(branch)
      const { admin, party, noticeId, data, before, committed } = scene
      const originalData = structuredClone(data)
      const holdBefore = await readCopyrightAccountHoldRaceState(party.id)
      expect(holdBefore.holds).toEqual([])
      expect(before.aggregate).not.toBeNull()
      const race = await interleaveCopyrightOwnedRead({
        marker: 'readCopyrightCaseDestructionPreservation',
        ownedId: noticeId,
        first: () => runCopyrightCasePurgePage(data, destructiveHoldNow),
        second: () => placeUserPreservationHold(admin, party.id, `before-${branch}-admission`),
      })
      try {
        expect(race.observerErrors).toEqual([])
        expect(race.reached || race.first.status === 'rejected').toBe(true)
        expect(data).toEqual(originalData)
        const hold =
          race.second.status === 'fulfilled'
            ? { status: 'fulfilled' }
            : copyrightRaceResult(race.second)
        const held = {
          pending: true,
          holds: [
            {
              id: expect.any(String),
              account_user_id: party.id,
              reference: `before-${branch}-admission`,
              placed_by_id: admin.id,
              placed_at: expect.any(Date),
              released_by_id: null,
              released_at: null,
            },
          ],
          audits: [
            {
              action_type: 'preservation_hold_place',
              actor_user_id: admin.id,
              target_user_id: party.id,
            },
          ],
        }
        const page =
          race.first.status === 'fulfilled'
            ? {
                status: 'fulfilled',
                hasMore: race.first.value.hasMore,
                deferred: race.first.value.deferred,
                phase: race.first.value.data.phase,
                phaseIndex: race.first.value.data.phaseIndex,
              }
            : copyrightRaceResult(race.first)
        const committedPage = {
          status: 'fulfilled',
          hasMore: true,
          deferred: undefined,
          phase: branch === 'final' ? 'residual_parties' : data.phase,
          phaseIndex:
            branch === 'final'
              ? 0
              : branch === 'pointers'
                ? 2
                : branch === 'nested' || branch === 'email_links'
                  ? data.phaseIndex
                  : data.phaseIndex + 1,
        }
        expect([
          {
            page: nativeCopyrightSerializationConflict,
            hold: { status: 'fulfilled' },
            state: before,
            holdState: held,
          },
          {
            page: nativeCopyrightSerializationConflict,
            hold: copyrightAccountHoldConflict,
            state: before,
            holdState: holdBefore,
          },
          {
            page: committedPage,
            hold: copyrightAccountHoldConflict,
            state: committed,
            holdState: holdBefore,
          },
        ]).toContainEqual({
          page,
          hold,
          state: await scene.readState(),
          holdState: await readCopyrightAccountHoldRaceState(party.id),
        })
      } finally {
        if (race.second.status === 'fulfilled') await releaseUserPreservationHold(admin, party.id)
      }
    },
  )

  it.each(families)(
    'keeps a committed hold visible on the next %s tick without changing rows or cursor',
    async branch => {
      const scene = await createCopyrightDestructiveHoldScene(branch)
      await seedCopyrightCommittedAccountHold(scene.admin, scene.party.id)
      const originalData = structuredClone(scene.data)
      try {
        const nextTick = await runCopyrightCasePurgePage(scene.data, destructiveHoldNow)
        expect(nextTick).toEqual({ data: originalData, hasMore: true, deferred: true })
        expect(scene.data).toEqual(originalData)
        expect(await scene.readState()).toEqual(scene.before)
        // Settle the real account propagation, then exercise the active-hold predicate itself.
        const synced = await runCopyrightAccountClockSyncPage({
          accountUserId: scene.party.id,
          afterNoticeId: null,
          sourceVersion: null,
        })
        expect(synced.hasMore).toBe(false)
        const settledHold = await readCopyrightAccountHoldRaceState(scene.party.id)
        expect(settledHold.pending).toBe(false)
        expect(settledHold.holds).toHaveLength(1)
        expect(settledHold.holds[0]?.released_at).toBeNull()
        const settledRows = await scene.readState()
        // The clock-sync changed the old proof. Start an independent fresh phase probe so
        // the real final admission, rather than proof-reset pagination, decides preservation.
        const freshData = { ...scene.data, proofVersion: null, legalClockAt: null }
        const guarded = await runCopyrightCasePurgePage(freshData, destructiveHoldNow)
        expect(guarded).toEqual({
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
        expect(freshData).toEqual({ ...originalData, proofVersion: null, legalClockAt: null })
        expect(scene.data).toEqual(originalData)
        expect(await scene.readState()).toEqual(settledRows)
        expect(await readCopyrightAccountHoldRaceState(scene.party.id)).toEqual(settledHold)
      } finally {
        await releaseUserPreservationHold(scene.admin, scene.party.id)
      }
    },
  )
})
