import { expect } from 'vitest'
import type { CopyrightEvidenceBucket } from './services/copyright-notices/retention-evidence-bucket.mts'
import { afterS3ImagesClientVersionListForTest } from './s3-images-client-injection.mts'
import {
  interleaveCopyrightOwnedRead,
  settleCopyrightActor,
} from './copyright-owned-read-interleave.mts'
import {
  createCopyrightMarkerHoldScene,
  type MarkerHoldTiming,
} from './copyright-marker-hold-scene.mts'
import {
  copyrightAccountHoldConflict,
  readCopyrightAccountHoldRaceState,
} from './copyright-account-hold-race-state.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import { destructiveHoldNow } from './copyright-destructive-hold-scene.mts'
import {
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../services/users/preservation-holds.mts'
import { runCopyrightCasePurgePage } from '../services/copyright-notices/retention-case-purge-page.mts'

/** The real one-shot actors and provider calls are coupled to all durable legal stages. */
export async function assertCopyrightMarkerHoldRace(
  timing: MarkerHoldTiming,
  bucket: CopyrightEvidenceBucket,
) {
  const scene = await createCopyrightMarkerHoldScene(timing)
  const { admin, party, noticeId, key, data, before } = scene
  const versions = timing === 'empty_version_list' || !key ? 0 : 2
  if (versions > 0) await bucket.put(key!, { versions })
  const holdBefore = await readCopyrightAccountHoldRaceState(party.id)
  const originalData = structuredClone(data)
  let hold:
    | ReturnType<typeof settleCopyrightActor<Awaited<ReturnType<typeof placeUserPreservationHold>>>>
    | undefined
  const place = () =>
    (hold ??= settleCopyrightActor(() =>
      placeUserPreservationHold(admin, party.id, `before-${timing}-admission`),
    ))
  const observation =
    timing === 'version_list' || timing === 'empty_version_list'
      ? afterS3ImagesClientVersionListForTest(bucket.name(), key!, async () => {
          await place()
        })
      : undefined
  const race = observation
    ? {
        first: await settleCopyrightActor(() =>
          runCopyrightCasePurgePage(data, destructiveHoldNow),
        ),
        second: await place(),
        observerErrors: [],
      }
    : await interleaveCopyrightOwnedRead({
        ownedId: noticeId,
        marker: 'readCopyrightCasePurgeEligibility',
        first: () => runCopyrightCasePurgePage(data, destructiveHoldNow),
        second: async () => {
          const result = await place()
          if (result.status === 'rejected') throw result.reason
          return result.value
        },
      })
  try {
    expect(race.observerErrors).toEqual([])
    expect(data).toEqual(originalData)
    const held = {
      pending: true,
      holds: [
        {
          id: expect.any(String),
          account_user_id: party.id,
          placed_by_id: admin.id,
          reference: `before-${timing}-admission`,
          placed_at: expect.any(Date),
          released_at: null,
          released_by_id: null,
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
    const completed =
      timing === 'marker'
        ? { ...before, clock: { ...before.clock, evidence_erased_at: expect.any(Date) } }
        : timing === 'claim'
          ? { ...before, storage: { ...before.storage!, claimed: true } }
          : {
              ...before,
              storage: null,
              aggregate: {
                ...before.aggregate!,
                evidenceArtifacts: before.aggregate!.evidenceArtifacts.map(row => ({
                  ...row,
                  storage_object_id: null,
                })),
              },
            }
    const committedPage = {
      status: 'fulfilled',
      hasMore: true,
      deferred: undefined,
      phase: timing === 'marker' ? 'pointers' : 'evidence',
      phaseIndex: 0,
    }
    const blockedPage = {
      status: 'fulfilled',
      hasMore: true,
      deferred: true,
      phase: 'parties',
      phaseIndex: 0,
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
    const holdResult =
      race.second.status === 'fulfilled'
        ? { status: 'fulfilled' }
        : copyrightRaceResult(race.second)
    expect([
      {
        page: blockedPage,
        hold: { status: 'fulfilled' },
        state: before,
        holdState: held,
        versions,
        deletes: observation ? 0 : null,
      },
      {
        page: committedPage,
        hold: copyrightAccountHoldConflict,
        state: completed,
        holdState: holdBefore,
        versions: timing === 'marker' || timing === 'claim' ? versions : 0,
        deletes: observation ? (timing === 'version_list' ? 1 : 0) : null,
      },
      {
        page: nativeCopyrightSerializationConflict,
        hold: { status: 'fulfilled' },
        state: before,
        holdState: held,
        versions,
        deletes: observation ? 0 : null,
      },
      {
        page: nativeCopyrightSerializationConflict,
        hold: copyrightAccountHoldConflict,
        state: before,
        holdState: holdBefore,
        versions,
        deletes: observation ? 0 : null,
      },
    ]).toContainEqual({
      page,
      hold: holdResult,
      state: await scene.readState(),
      holdState: await readCopyrightAccountHoldRaceState(party.id),
      versions: key ? await bucket.countVersions(key) : 0,
      deletes: observation?.deleteCalls() ?? null,
    })
  } finally {
    if (race.second.status === 'fulfilled') await releaseUserPreservationHold(admin, party.id)
  }
}
