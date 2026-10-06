import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  deleteContributionAdmissionReservationDuringMutationForTest,
  expireContributionAdmissionForTest,
  getContributionAdmissionClaimExpiryForTest,
  getContributionAdmissionReservationStateForTest,
  setContributionAdmissionReplayMetadataForTest,
} from '@voucha/test-helpers'
import { getContributionAdmissionAttemptsForTest } from '@voucha/test-helpers/contribution-admission-attempts'
import { pollUntilNotNull } from '@voucha/test-helpers/polling'
import { waitForTestPostgresLockWaiter } from '@voucha/test-helpers/postgres-lock-wait'
import {
  countTestCommunitiesCreatedBy,
  holdTestAdmissionReservationLock,
  listTestDelegatedCreateReservations,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import { createCommunity } from '@services/communities'
import { pruneExpiredContributionAdmissions } from '@services/contribution-gating/admission'
import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'

// The handle the ledger passes to a create; derived so this package takes no storage dependency.
type TransactionQuery = Parameters<Parameters<typeof admitDelegatedCreate>[0]['execute']>[0]

async function setup() {
  const user = await createTestUser()
  const base = {
    authority: { kind: 'delegated' as const, credentialOwnerId: user.id },
    currentUser: user,
    idempotencyKey: crypto.randomUUID(),
    route: 'communities.create' as const,
    scope: 'global',
    intent: { name: 'Quiet Birdwatchers Of Lakeside' },
  }
  const key = { actorId: user.id, idempotencyKey: base.idempotencyKey }
  // A real create in the ledger transaction: the entity the ledger must keep exactly-once.
  const createIn = async (query: TransactionQuery) => {
    const community = await createCommunity(
      user.id,
      { createdVia: 'mcp', oauthClientId: null },
      {
        name: 'Quiet Birdwatchers Of Lakeside',
        member_invites_allowed_at: null,
        post_approval_required_at: null,
      },
      { query },
    )
    return { community: { id: community.id } }
  }
  return { user, base, key, createIn }
}

describe('delegated create ledger — real store', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renews the claim lease while a slow create runs, so the key stays held', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { user, base, key, createIn } = await setup()
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const running = admitDelegatedCreate({
      ...base,
      execute: async query => {
        started.resolve()
        await finish.promise
        return createIn(query)
      },
    })
    await started.promise
    const claimed = (await getContributionAdmissionClaimExpiryForTest(key))!

    await vi.advanceTimersByTimeAsync(10_000)
    const renewed = await pollUntilNotNull(async () => {
      const expiry = await getContributionAdmissionClaimExpiryForTest(key)
      return expiry && expiry > claimed ? expiry : null
    }, 5_000)

    expect(renewed.getTime()).toBeGreaterThan(claimed.getTime())
    await expect(
      admitDelegatedCreate({ ...base, execute: async () => ({ ok: false }) }),
    ).rejects.toMatchObject({ code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS' })
    finish.resolve()
    await running
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(1)
  })

  it('commits the create with its stored response, so an unstorable response creates nothing', async () => {
    const { user, base, key, createIn } = await setup()
    // The ledger bounds a stored response at 2 MiB.
    const oversized = async (query: TransactionQuery) => ({
      ...(await createIn(query)),
      filler: 'x'.repeat(2_200_000),
    })

    await expect(admitDelegatedCreate({ ...base, execute: oversized })).rejects.toThrow(
      'post_admission_reservations_metadata_bounds_check',
    )
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(0)
    expect(await getContributionAdmissionReservationStateForTest(key)).toBe('in_progress')
    expect(await getContributionAdmissionAttemptsForTest(key)).toMatchObject([
      {
        attempt_number: 1,
        failure: {
          message: expect.stringContaining('post_admission_reservations_metadata_bounds'),
        },
      },
    ])

    const created = await admitDelegatedCreate({ ...base, execute: createIn })
    expect(await admitDelegatedCreate({ ...base, execute: createIn })).toEqual(created)
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(1)
  })

  it('rolls the create back when the lease is lost before the response is stored', async () => {
    const { user, base, key, createIn } = await setup()

    await expect(
      admitDelegatedCreate({
        ...base,
        execute: async query => {
          const created = await createIn(query)
          await deleteContributionAdmissionReservationDuringMutationForTest(query, key)
          return created
        },
      }),
    ).rejects.toMatchObject({ code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS' })

    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(0)
  })

  it('settles a claim whose reservation is freed mid-claim and lets the next call create once', async () => {
    const { user, base, key, createIn } = await setup()
    await expect(
      admitDelegatedCreate({
        ...base,
        execute: async () => {
          throw new Error('store unavailable')
        },
      }),
    ).rejects.toThrow('store unavailable')

    // The retry waits on the reservation lock; the holder frees the key before it gets the lock.
    await using lock = await holdTestAdmissionReservationLock(key.actorId, key.idempotencyKey)
    const retry = admitDelegatedCreate({ ...base, execute: createIn })
    const settled = retry.then(
      () => 'created',
      (err: unknown) => err,
    )
    try {
      await waitForTestPostgresLockWaiter(lock.processId, 'claimContributionAdmission.reservation')
    } finally {
      await lock.deleteAndRelease()
    }

    expect(await settled).toBeInstanceOf(Error)
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(0)
    await admitDelegatedCreate({ ...base, execute: createIn })
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(1)
  })

  it('replays a committed create whose finalization never completed, then prunes it', async () => {
    const { user, base, key, createIn } = await setup()
    const created = await admitDelegatedCreate({ ...base, execute: createIn })
    // The state a crash between the commit and the finalizing step leaves: committed, no post.
    await setContributionAdmissionReplayMetadataForTest({
      ...key,
      replayMetadata: { route: 'communities.create', scope: 'global', finalization: 'pending' },
    })
    expect(await listTestDelegatedCreateReservations(user.id)).toMatchObject([
      { state: 'committed', finalization: 'pending', committed_post_id: null },
    ])

    expect(await admitDelegatedCreate({ ...base, execute: createIn })).toEqual(created)
    expect(await listTestDelegatedCreateReservations(user.id)).toMatchObject([
      { finalization: 'complete', committed_post_id: null },
    ])
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(1)

    await setContributionAdmissionReplayMetadataForTest({
      ...key,
      replayMetadata: { route: 'communities.create', scope: 'global', finalization: 'pending' },
    })
    await expireContributionAdmissionForTest(key)
    await pruneExpiredContributionAdmissions()
    expect(await getContributionAdmissionReservationStateForTest(key)).toBeNull()
  })

  it('prunes an expired replay and then accepts the key for a new request', async () => {
    const { user, base, key, createIn } = await setup()
    await admitDelegatedCreate({ ...base, execute: createIn })
    expect(await getContributionAdmissionReservationStateForTest(key)).toBe('committed')

    await expireContributionAdmissionForTest(key)
    await pruneExpiredContributionAdmissions()

    expect(await getContributionAdmissionReservationStateForTest(key)).toBeNull()
    await admitDelegatedCreate({ ...base, intent: { name: 'Another request' }, execute: createIn })
    expect(await getContributionAdmissionReservationStateForTest(key)).toBe('committed')
    expect(await countTestCommunitiesCreatedBy(user.id)).toBe(2)
  })
})
