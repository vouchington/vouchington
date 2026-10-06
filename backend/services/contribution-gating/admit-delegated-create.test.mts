import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  executeTestAdmittedPost,
  expireContributionAdmissionClaimForTest,
} from '@voucha/test-helpers'
import { getContributionAdmissionAttemptsForTest } from '@voucha/test-helpers/contribution-admission-attempts'
import { listTestDelegatedCreateReservations } from '@voucha/test-helpers/mcp-write-tool-rows'
import { runContributionAdmission } from './admission.mts'
import { admitDelegatedCreate } from './admit-delegated-create.mts'

/** An error the way a domain refusal arrives: a 4xx status the ledger treats as terminal. */
const refusal = (status: number, message: string) => Object.assign(new Error(message), { status })

async function setup() {
  const user = await createTestUser()
  return {
    authority: { kind: 'delegated' as const, credentialOwnerId: user.id },
    currentUser: user,
    idempotencyKey: crypto.randomUUID(),
    route: 'communities.create' as const,
    scope: 'global',
    intent: { body: { name: crypto.randomUUID() } },
  }
}

const ledgerRows = listTestDelegatedCreateReservations

describe('delegated create admission — real store', () => {
  it('runs a create once and replays its exact response for the same key and request', async () => {
    const args = await setup()
    let runs = 0
    const execute = async () => ({ success: true as const, thing: { id: `thing-${++runs}` } })

    const first = await admitDelegatedCreate({ ...args, execute })
    const second = await admitDelegatedCreate({ ...args, execute })

    expect(first).toEqual({ success: true, thing: { id: 'thing-1' } })
    expect(second).toEqual(first)
    expect(runs).toBe(1)
    const rows = await ledgerRows(args.currentUser.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      route: 'communities.create',
      state: 'committed',
      response: first,
    })
  })

  it('rejects the same key with a changed request or route and writes nothing new', async () => {
    const args = await setup()
    await admitDelegatedCreate({ ...args, execute: async () => ({ ok: true }) })
    const rows = await ledgerRows(args.currentUser.id)
    let runs = 0
    const execute = async () => ({ ok: ++runs })

    await expect(
      admitDelegatedCreate({ ...args, intent: { body: { name: 'changed' } }, execute }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
    await expect(
      admitDelegatedCreate({ ...args, route: 'reports.create', execute }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })

    expect(runs).toBe(0)
    expect(await ledgerRows(args.currentUser.id)).toEqual(rows)
  })

  it('shares one key space with post admissions', async () => {
    const args = await setup()
    await runContributionAdmission({
      actorId: args.currentUser.id,
      idempotencyKey: args.idempotencyKey,
      intent: { request: crypto.randomUUID() },
      execute: executeTestAdmittedPost,
    })

    await expect(
      admitDelegatedCreate({ ...args, execute: async () => ({ ok: true }) }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
  })

  it('keeps keys independent per credential owner', async () => {
    const first = await setup()
    const other = await createTestUser()
    const execute = async () => ({ owner: crypto.randomUUID() })

    const mine = await admitDelegatedCreate({ ...first, execute })
    const theirs = await admitDelegatedCreate({
      ...first,
      authority: { kind: 'delegated', credentialOwnerId: other.id },
      currentUser: other,
      execute,
    })

    expect(theirs).not.toEqual(mine)
    expect(await ledgerRows(first.currentUser.id)).toHaveLength(1)
    expect(await ledgerRows(other.id)).toHaveLength(1)
  })

  it('frees the key on a refusal and keeps it retryable on a failure', async () => {
    const args = await setup()
    await expect(
      admitDelegatedCreate({
        ...args,
        execute: async () => {
          throw refusal(404, 'Not found')
        },
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(await ledgerRows(args.currentUser.id)).toEqual([])

    await expect(
      admitDelegatedCreate({
        ...args,
        execute: async () => {
          throw new Error('store unavailable')
        },
      }),
    ).rejects.toThrow('store unavailable')
    // A failure is an immutable attempt result; the key stays open for the retry.
    expect(await ledgerRows(args.currentUser.id)).toMatchObject([{ state: 'in_progress' }])
    expect(
      await getContributionAdmissionAttemptsForTest({
        actorId: args.currentUser.id,
        idempotencyKey: args.idempotencyKey,
      }),
    ).toMatchObject([{ attempt_number: 1, failure: { message: 'store unavailable' } }])

    await expect(
      admitDelegatedCreate({ ...args, execute: async () => ({ ok: true }) }),
    ).resolves.toEqual({ ok: true })
    expect(await ledgerRows(args.currentUser.id)).toMatchObject([{ state: 'committed' }])
  })

  it('runs beforeCreate after the claim, frees the key when it refuses and skips it on replay', async () => {
    const args = await setup()
    await expect(
      admitDelegatedCreate({
        ...args,
        beforeCreate: async () => {
          throw refusal(429, 'Slow down')
        },
        execute: async () => ({ ok: false }),
      }),
    ).rejects.toMatchObject({ status: 429 })
    expect(await ledgerRows(args.currentUser.id)).toEqual([])

    const first = await admitDelegatedCreate({ ...args, execute: async () => ({ ok: true }) })
    await expect(
      admitDelegatedCreate({
        ...args,
        beforeCreate: async () => {
          throw refusal(429, 'Slow down')
        },
        execute: async () => ({ ok: false }),
      }),
    ).resolves.toEqual(first)
  })

  it('asks a concurrent caller to retry while the first create is running', async () => {
    const args = await setup()
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const first = admitDelegatedCreate({
      ...args,
      execute: async () => {
        started.resolve()
        await finish.promise
        return { ok: true }
      },
    })
    await started.promise
    try {
      await expect(
        admitDelegatedCreate({ ...args, execute: async () => ({ ok: false }) }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
        retryAfterSeconds: expect.any(Number),
      })
    } finally {
      finish.resolve()
    }
    const result = await first
    await expect(
      admitDelegatedCreate({ ...args, execute: async () => ({ ok: false }) }),
    ).resolves.toEqual(result)
  })

  it('lets a retry take over a claim whose lease has passed and fences the abandoned create', async () => {
    const args = await setup()
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    // Observed from the start: the abandoned create settles while the retry is still being awaited.
    const abandoned = admitDelegatedCreate({
      ...args,
      execute: async () => {
        started.resolve()
        await finish.promise
        return { run: 'abandoned' }
      },
    }).then(
      () => null,
      (err: unknown) => err,
    )
    await started.promise
    await expireContributionAdmissionClaimForTest({
      actorId: args.currentUser.id,
      idempotencyKey: args.idempotencyKey,
    })

    const takeover = await admitDelegatedCreate({
      ...args,
      execute: async () => ({ run: 'retry' }),
    })
    finish.resolve()

    expect(takeover).toEqual({ run: 'retry' })
    expect(await abandoned).toMatchObject({ code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS' })
    expect((await ledgerRows(args.currentUser.id))[0]!.response).toEqual({ run: 'retry' })
  })

  it('refuses absent, mismatched or non-UUID credentials before claiming a key', async () => {
    const args = await setup()
    const execute = async () => ({ ok: true })

    await expect(
      admitDelegatedCreate({ ...args, authority: undefined as never, execute }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      admitDelegatedCreate({
        ...args,
        authority: { kind: 'delegated', credentialOwnerId: crypto.randomUUID() },
        execute,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      admitDelegatedCreate({ ...args, idempotencyKey: 'not-a-uuid', execute }),
    ).rejects.toMatchObject({ status: 422 })

    expect(await ledgerRows(args.currentUser.id)).toEqual([])
  })
})
