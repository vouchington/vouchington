import {
  createTestBlocklistBloomLockProbe,
  injectTestBlocklistBloomUnlockFault,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  BLOCKLIST_BLOOM_FILTER_LOCK_NAMESPACE,
  withBlocklistBloomFilterLock,
} from './bloom-filter-lock.mts'

describe('bloom-filter-lock.generated', () => {
  it('serializes operations for the same blocklist Bloom filter', async () => {
    const outerEntered = Promise.withResolvers<void>()
    const releaseOuter = Promise.withResolvers<void>()
    const probe = await createTestBlocklistBloomLockProbe(
      BLOCKLIST_BLOOM_FILTER_LOCK_NAMESPACE,
      'url-blocklist',
    )

    const outerLock = withBlocklistBloomFilterLock('url-blocklist', async () => {
      outerEntered.resolve()
      await releaseOuter.promise
    })

    try {
      await outerEntered.promise
      await expect(probe.tryAcquire()).resolves.toBe(false)

      releaseOuter.resolve()
      await outerLock
      await expect(probe.tryAcquire()).resolves.toBe(true)
    } finally {
      releaseOuter.resolve()
      await Promise.allSettled([outerLock])
      await probe.release()
    }
  })

  it('keeps different blocklist Bloom filters independent', async () => {
    const urlEntered = Promise.withResolvers<void>()
    const releaseUrl = Promise.withResolvers<void>()
    const emailProbe = await createTestBlocklistBloomLockProbe(
      BLOCKLIST_BLOOM_FILTER_LOCK_NAMESPACE,
      'email-blocklist',
    )

    const urlLock = withBlocklistBloomFilterLock('url-blocklist', async () => {
      urlEntered.resolve()
      await releaseUrl.promise
    })

    try {
      await urlEntered.promise
      await expect(emailProbe.tryAcquire()).resolves.toBe(true)
    } finally {
      releaseUrl.resolve()
      await Promise.allSettled([urlLock])
      await emailProbe.release()
    }
  })

  it('returns the operation result after releasing the lock', async () => {
    await expect(
      withBlocklistBloomFilterLock('url-blocklist', async () => 'rebuilt'),
    ).resolves.toBe('rebuilt')
  })

  it('preserves the operation error after releasing the lock', async () => {
    const operationError = new Error('operation failed')

    await expect(
      withBlocklistBloomFilterLock('url-blocklist', async () => {
        throw operationError
      }),
    ).rejects.toBe(operationError)
  })

  it('destroys the client and rejects with the unlock error after a successful operation', async () => {
    const unlockError = new Error('unlock failed')
    const injectedFault = injectTestBlocklistBloomUnlockFault({ unlockError })
    try {
      await expect(withBlocklistBloomFilterLock('url-blocklist', async () => 'ok')).rejects.toBe(
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
    const injectedFault = injectTestBlocklistBloomUnlockFault({ unlockError })
    try {
      await expect(
        withBlocklistBloomFilterLock('url-blocklist', async () => {
          throw operationError
        }),
      ).rejects.toBe(operationError)
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })

  it('destroys the client when PostgreSQL reports that the lock was not held', async () => {
    const injectedFault = injectTestBlocklistBloomUnlockFault({ unlocked: false })
    try {
      await expect(
        withBlocklistBloomFilterLock('email-blocklist', async () => 'ok'),
      ).rejects.toThrow(/Blocklist Bloom filter lock was not held for email-blocklist/)
      expect(injectedFault.releasedWith()).toBe(true)
    } finally {
      injectedFault.restore()
    }
  })
})
