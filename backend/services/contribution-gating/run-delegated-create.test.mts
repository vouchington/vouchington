import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  expireTestMcpCreateAttemptLeases,
  listTestMcpCreateAttempts,
} from '@voucha/test-helpers/mcp-write-tool-rows'
import { runDelegatedCreate } from './run-delegated-create.mts'

async function setup() {
  const user = await createTestUser()
  return {
    authority: { kind: 'delegated' as const, credentialOwnerId: user.id },
    currentUser: user,
    idempotencyKey: crypto.randomUUID(),
    intent: { tool: 'create_thing', body: { name: crypto.randomUUID() } },
  }
}

const ledgerRows = listTestMcpCreateAttempts

describe('delegated create ledger — real store', () => {
  it('runs a create once and replays its exact response for the same key and request', async () => {
    const args = await setup()
    let runs = 0
    const execute = async () => ({ success: true as const, thing: { id: `thing-${++runs}` } })

    const first = await runDelegatedCreate({ ...args, execute })
    const second = await runDelegatedCreate({ ...args, execute })

    expect(first).toEqual({ success: true, thing: { id: 'thing-1' } })
    expect(second).toEqual(first)
    expect(runs).toBe(1)
    const rows = await ledgerRows(args.currentUser.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.response).toEqual(first)
    expect(rows[0]!.completed_at).toBeInstanceOf(Date)
  })

  it('rejects the same key with a changed request or tool and writes nothing new', async () => {
    const args = await setup()
    await runDelegatedCreate({ ...args, execute: async () => ({ ok: true }) })
    const [row] = await ledgerRows(args.currentUser.id)
    let runs = 0
    const execute = async () => ({ ok: ++runs })

    await expect(
      runDelegatedCreate({
        ...args,
        intent: { ...args.intent, body: { name: 'changed' } },
        execute,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })
    await expect(
      runDelegatedCreate({ ...args, intent: { ...args.intent, tool: 'other_tool' }, execute }),
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' })

    expect(runs).toBe(0)
    expect(await ledgerRows(args.currentUser.id)).toEqual([row])
  })

  it('keeps keys independent per credential owner', async () => {
    const first = await setup()
    const other = await createTestUser()
    const execute = async () => ({ owner: crypto.randomUUID() })

    const mine = await runDelegatedCreate({ ...first, execute })
    const theirs = await runDelegatedCreate({
      ...first,
      authority: { kind: 'delegated', credentialOwnerId: other.id },
      currentUser: other,
      execute,
    })

    expect(theirs).not.toEqual(mine)
    expect(await ledgerRows(first.currentUser.id)).toHaveLength(1)
    expect(await ledgerRows(other.id)).toHaveLength(1)
  })

  it('releases the key when the create fails so a retry runs it again', async () => {
    const args = await setup()
    await expect(
      runDelegatedCreate({
        ...args,
        execute: async () => {
          throw new Error('domain refusal')
        },
      }),
    ).rejects.toThrow('domain refusal')
    expect(await ledgerRows(args.currentUser.id)).toEqual([])

    await expect(
      runDelegatedCreate({ ...args, execute: async () => ({ ok: true }) }),
    ).resolves.toEqual({ ok: true })
    expect(await ledgerRows(args.currentUser.id)).toHaveLength(1)
  })

  it('asks a concurrent caller to retry while the first create is running', async () => {
    const args = await setup()
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const first = runDelegatedCreate({
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
        runDelegatedCreate({ ...args, execute: async () => ({ ok: false }) }),
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
      runDelegatedCreate({ ...args, execute: async () => ({ ok: false }) }),
    ).resolves.toEqual(result)
  })

  it('lets a retry take over an unfinished claim once its lease has passed', async () => {
    const args = await setup()
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const abandoned = runDelegatedCreate({
      ...args,
      execute: async () => {
        started.resolve()
        await finish.promise
        return { run: 'abandoned' }
      },
    })
    await started.promise
    await expireTestMcpCreateAttemptLeases(args.currentUser.id)

    const takeover = await runDelegatedCreate({ ...args, execute: async () => ({ run: 'retry' }) })

    expect(takeover).toEqual({ run: 'retry' })
    finish.resolve()
    await abandoned
    expect((await ledgerRows(args.currentUser.id))[0]!.response).toEqual({ run: 'retry' })
  })

  it('refuses absent, mismatched or non-UUID credentials before claiming a key', async () => {
    const args = await setup()
    const execute = async () => ({ ok: true })

    await expect(
      runDelegatedCreate({ ...args, authority: undefined as never, execute }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      runDelegatedCreate({
        ...args,
        authority: { kind: 'delegated', credentialOwnerId: crypto.randomUUID() },
        execute,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      runDelegatedCreate({ ...args, idempotencyKey: 'not-a-uuid', execute }),
    ).rejects.toMatchObject({ status: 422 })

    expect(await ledgerRows(args.currentUser.id)).toEqual([])
  })
})
