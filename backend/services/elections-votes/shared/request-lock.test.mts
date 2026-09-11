import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getPsqlPoolConfiguration } from '@data-stores/psql/pool-config'
import {
  getTestPostgresAdvisoryLockHolderProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { injectTestElectionVoteRequestUnlockFault } from '@voucha/test-helpers/election-vote-request-lock'
import { probeWritePool } from '@voucha/test-helpers/write-pool-probe'
import { withElectionVoteRequestLock } from './request-lock.mts'

describe('withElectionVoteRequestLock', () => {
  it('lets many distinct session locks complete inner write-pool queries', async () => {
    const { writeMax } = getPsqlPoolConfiguration()
    const requestPrefix = randomUUID()

    const values = await within(
      Promise.all(
        Array.from({ length: writeMax }, async (_, index) => {
          return withElectionVoteRequestLock(
            'post',
            `${requestPrefix}-user-${index}`,
            `${requestPrefix}-post-${index}`,
            async () => {
              // Give concurrent lock acquisitions a chance to fill their session pool before
              // exercising the handler's separate write-pool query.
              await new Promise<void>(resolve => setImmediate(resolve))
              return probeWritePool(index)
            },
          )
        }),
      ),
      10_000,
    )

    expect(values).toEqual(Array.from({ length: writeMax }, (_, index) => index))
  })

  it('serializes handlers that use the same election vote request key', async () => {
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const secondEntered = Promise.withResolvers<void>()
    const executionOrder: string[] = []
    const entityId = randomUUID()
    const requestKey = `vote-request:post:same-user:${entityId}`

    const first = withElectionVoteRequestLock('post', 'same-user', entityId, async () => {
      executionOrder.push('first')
      firstEntered.resolve()
      await releaseFirst.promise
    })

    await firstEntered.promise
    const firstHolderProcessId = await getTestPostgresAdvisoryLockHolderProcessId({
      key: requestKey,
    })

    const second = withElectionVoteRequestLock('post', 'same-user', entityId, async () => {
      executionOrder.push('second')
      secondEntered.resolve()
    })

    await waitForTestPostgresLockWaiter(firstHolderProcessId, 'lockElectionVoteRequest')
    expect(executionOrder).toEqual(['first'])

    releaseFirst.resolve()
    await secondEntered.promise
    await Promise.all([first, second])

    expect(executionOrder).toEqual(['first', 'second'])
  })

  it('rethrows a handler failure only after releasing its request lock', async () => {
    const failure = new Error('expected handler failure')

    await expect(
      withElectionVoteRequestLock('post', randomUUID(), randomUUID(), async () => {
        throw failure
      }),
    ).rejects.toBe(failure)

    await expect(
      withElectionVoteRequestLock('post', randomUUID(), randomUUID(), async () => 'unlocked'),
    ).resolves.toBe('unlocked')
  })

  it('destroys the client and rejects with the unlock error after a successful handler', async () => {
    const unlockError = new Error('unlock failed')
    const injectedFault = injectTestElectionVoteRequestUnlockFault({ unlockError })
    try {
      await expect(
        withElectionVoteRequestLock('post', randomUUID(), randomUUID(), async () => 'ok'),
      ).rejects.toBe(unlockError)
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })

  it('keeps the handler error primary when unlocking also fails', async () => {
    const handlerError = new Error('handler failed')
    const unlockError = new Error('unlock failed')
    const injectedFault = injectTestElectionVoteRequestUnlockFault({ unlockError })
    try {
      await expect(
        withElectionVoteRequestLock('post', randomUUID(), randomUUID(), async () => {
          throw handlerError
        }),
      ).rejects.toBe(handlerError)
      expect(handlerError.cause).toBe(unlockError)
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })

  it('destroys the client when PostgreSQL reports a missing request lock', async () => {
    const injectedFault = injectTestElectionVoteRequestUnlockFault({ unlocked: false })
    try {
      await expect(
        withElectionVoteRequestLock('post', randomUUID(), randomUUID(), async () => 'ok'),
      ).rejects.toThrow(/request lock was not held/)
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })
})

async function within<Result>(promise: Promise<Result>, timeoutMs: number): Promise<Result> {
  const signal = AbortSignal.timeout(timeoutMs)
  const timedOut = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new Error(`Election vote request locks did not complete within ${timeoutMs}ms`)),
      { once: true },
    )
  })
  return Promise.race([promise, timedOut])
}
