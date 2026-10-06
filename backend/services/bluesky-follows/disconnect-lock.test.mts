import { describe, expect, it } from 'vitest'

import type { SessionAdvisoryLockDualFailure } from '@services/session-advisory-lock'
import { beginTransaction, injectTestBlueskyDisconnectUnlockFault } from '@voucha/test-helpers'
import { BLUESKY_DISCONNECT_LOCK_NAMESPACE, withBlueskyDisconnectLock } from './disconnect-lock.mts'

async function probeBlueskyDisconnectLock(userId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`/* bluesky disconnect lock timeout */ SET LOCAL lock_timeout = '50ms'`)
  await query(
    `/* bluesky disconnect lock probe */ SELECT pg_advisory_xact_lock($1, hashtext($2))`,
    [BLUESKY_DISCONNECT_LOCK_NAMESPACE, userId],
  )
  await query.commit()
}

describe('Bluesky disconnect session-lock cleanup', () => {
  it('lets unrelated users hold disconnect locks concurrently', async () => {
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const secondEntered = Promise.withResolvers<boolean>()
    const first = withBlueskyDisconnectLock(crypto.randomUUID(), async () => {
      firstEntered.resolve()
      await releaseFirst.promise
    })
    await firstEntered.promise
    const second = withBlueskyDisconnectLock(crypto.randomUUID(), async () => {
      secondEntered.resolve(true)
    })
    try {
      await expect(secondEntered.promise).resolves.toBe(true)
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([first, second])
    }
  })

  it('continues serializing two disconnect locks for the same user', async () => {
    const userId = crypto.randomUUID()
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const secondFinished = Promise.withResolvers<boolean>()
    const first = withBlueskyDisconnectLock(userId, async () => {
      firstEntered.resolve()
      await releaseFirst.promise
    })
    await firstEntered.promise
    const second = withBlueskyDisconnectLock(userId, async () => {
      secondFinished.resolve(true)
    })
    try {
      await expect(probeBlueskyDisconnectLock(userId)).rejects.toMatchObject({ code: '55P03' })
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([first, second])
    }
    await expect(secondFinished.promise).resolves.toBe(true)
  })

  it('destroys the client and rejects with the unlock error after a successful operation', async () => {
    const unlockError = new Error('unlock failed')
    const injectedFault = injectTestBlueskyDisconnectUnlockFault({ unlockError })
    try {
      await expect(withBlueskyDisconnectLock('unlock-failure', async () => 'ok')).rejects.toBe(
        unlockError,
      )
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })

  it('keeps the operation error primary when unlocking also fails and destroys the client', async () => {
    const operationError = new Error('operation failed')
    const unlockError = new Error('unlock failed')
    const injectedFault = injectTestBlueskyDisconnectUnlockFault({ unlockError })
    try {
      await expect(
        withBlueskyDisconnectLock('dual-failure', async () => {
          throw operationError
        }),
      ).rejects.toBe(operationError)
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })

  it('rejects an unknown dual-failure policy and destroys the client', async () => {
    const operationError = new Error('operation failed')
    const unlockError = new Error('unlock failed')
    const injectedFault = injectTestBlueskyDisconnectUnlockFault({ unlockError })
    const unknownPolicy = 'unknown-policy' as unknown as SessionAdvisoryLockDualFailure
    try {
      await expect(
        withBlueskyDisconnectLock(
          crypto.randomUUID(),
          async () => {
            throw operationError
          },
          unknownPolicy,
        ),
      ).rejects.toThrow('Unknown session advisory lock failure policy: unknown-policy')
      expect(operationError.cause).toBeUndefined()
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })

  it('destroys the client when PostgreSQL reports that the lock was not held', async () => {
    const injectedFault = injectTestBlueskyDisconnectUnlockFault({ unlocked: false })
    try {
      await expect(withBlueskyDisconnectLock('missing-lock', async () => 'ok')).rejects.toThrow(
        /advisory lock was not held/,
      )
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })
})
