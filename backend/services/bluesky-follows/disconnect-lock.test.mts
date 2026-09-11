import { describe, expect, it, vi } from 'vitest'

import {
  getTestPostgresAdvisoryLockHolderProcessId,
  injectTestBlueskyDisconnectUnlockFault,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { BLUESKY_DISCONNECT_LOCK_NAMESPACE, withBlueskyDisconnectLock } from './disconnect-lock.mts'

describe('Bluesky disconnect session-lock cleanup', () => {
  it('lets unrelated users hold disconnect locks concurrently', async () => {
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let secondEntered = false
    const first = withBlueskyDisconnectLock(crypto.randomUUID(), async () => {
      firstEntered.resolve()
      await releaseFirst.promise
    })
    await firstEntered.promise
    const second = withBlueskyDisconnectLock(crypto.randomUUID(), async () => {
      secondEntered = true
    })
    try {
      await vi.waitFor(() => expect(secondEntered).toBe(true))
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([first, second])
    }
  })

  it('continues serializing two disconnect locks for the same user', async () => {
    const userId = crypto.randomUUID()
    const firstEntered = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let secondEntered = false
    const first = withBlueskyDisconnectLock(userId, async () => {
      firstEntered.resolve()
      await releaseFirst.promise
    })
    await firstEntered.promise
    const firstHolderProcessId = await getTestPostgresAdvisoryLockHolderProcessId({
      namespace: BLUESKY_DISCONNECT_LOCK_NAMESPACE,
      key: userId,
    })
    const second = withBlueskyDisconnectLock(userId, async () => {
      secondEntered = true
    })
    try {
      await waitForTestPostgresLockWaiter(firstHolderProcessId, 'withBlueskyDisconnectLock:lock')
      expect(secondEntered).toBe(false)
    } finally {
      releaseFirst.resolve()
      await Promise.allSettled([first, second])
    }
    expect(secondEntered).toBe(true)
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
