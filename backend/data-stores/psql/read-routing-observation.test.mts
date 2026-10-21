import { describe, expect, it } from 'vitest'
import {
  closeRoutingObserverDuringPoolFaultForTest,
  createPostgresRoutingContentionForTest,
} from '@voucha/test-helpers/postgres-routing-contention'

describe('request-owned PostgreSQL routing observation', () => {
  it.each(['primary', 'replica'] as const)(
    'counts a queued %s request released outside its observation',
    async route => {
      const probe = createPostgresRoutingContentionForTest()
      const observed = await probe.observe()
      try {
        const release = await probe.borrow(route)
        const pending = observed.run(() => probe.query(route))
        expect(probe.waiting(route)).toBe(1)
        release()
        await pending
        expect(observed.primaryAcquisitions()).toBe(route === 'primary' ? 1 : 0)
        expect(observed.replicaAcquisitions()).toBe(route === 'replica' ? 1 : 0)
      } finally {
        await observed.close()
        await probe.close()
      }
    },
  )

  it('observes explicit promise-based queued clients without counting their unscoped holder', async () => {
    const probe = createPostgresRoutingContentionForTest()
    const observed = await probe.observe()
    try {
      const releaseHolder = await probe.borrow('primary')
      const pending = observed.run(() => probe.borrow('primary'))
      expect(probe.waiting('primary')).toBe(1)
      releaseHolder()
      const release = await pending
      release()
      expect(observed.primaryAcquisitions()).toBe(1)
      expect(observed.replicaAcquisitions()).toBe(0)
    } finally {
      await observed.close()
      await probe.close()
    }
  })

  it('ignores a foreign request released by an observed caller', async () => {
    const probe = createPostgresRoutingContentionForTest()
    const observed = await probe.observe()
    try {
      const release = await probe.borrow('replica')
      const pending = probe.query('replica')
      expect(probe.waiting('replica')).toBe(1)
      await observed.run(async () => {
        release()
        await pending
      })
      expect(observed.primaryAcquisitions()).toBe(0)
      expect(observed.replicaAcquisitions()).toBe(0)
    } finally {
      await observed.close()
      await probe.close()
    }
  })

  it('keeps overlapping audiences independent until the last idempotent close', async () => {
    const probe = createPostgresRoutingContentionForTest()
    const first = await probe.observe()
    const second = await probe.observe()
    try {
      await first.run(() => probe.query('primary'))
      expect(first.primaryAcquisitions()).toBe(1)
      expect(second.primaryAcquisitions()).toBe(0)
      await first.close()
      await first.close()
      await second.run(() => probe.query('replica'))
      expect(second.replicaAcquisitions()).toBe(1)
      expect(first.replicaAcquisitions()).toBe(0)
      await second.close()
      expect(probe.connectionMethodsRestored()).toBe(true)
    } finally {
      await Promise.all([first.close(), second.close()])
      await probe.close()
    }
  })

  it('ignores successful queued requests that complete after their audience closes', async () => {
    const probe = createPostgresRoutingContentionForTest()
    const observed = await probe.observe()
    try {
      const release = await probe.borrow('primary')
      const pending = observed.run(() => probe.query('primary'))
      expect(probe.waiting('primary')).toBe(1)
      await observed.close()
      release()
      await pending
      expect(observed.primaryAcquisitions()).toBe(0)
      expect(probe.connectionMethodsRestored()).toBe(true)
    } finally {
      await observed.close()
      await probe.close()
    }
  })

  it('preserves callback and promise failures without counting failed checkouts', async () => {
    const probe = createPostgresRoutingContentionForTest()
    const observed = await probe.observe()
    try {
      await probe.end('replica')
      await expect(observed.run(() => probe.query('replica'))).rejects.toBeInstanceOf(Error)
      await expect(observed.run(() => probe.borrow('replica'))).rejects.toBeInstanceOf(Error)
      expect(observed.primaryAcquisitions()).toBe(0)
      expect(observed.replicaAcquisitions()).toBe(0)
    } finally {
      await observed.close()
      await probe.close()
    }
  })

  it('restores the real pools after a competing fault injector restores its captured wrapper', async () => {
    const result = await closeRoutingObserverDuringPoolFaultForTest()
    expect(result.error).toMatchObject({ code: '25P02' })
    expect(result.restored).toBe(true)
  })

  it('can retry cleanup after a nested close was rejected by the instrumentation guard', async () => {
    const result = await closeRoutingObserverDuringPoolFaultForTest('nested')
    expect(result.nestedCloseError).toMatchObject({
      message: 'PostgreSQL pool instrumentation cannot be nested',
    })
    expect(result.error).toMatchObject({ code: '25P02' })
    expect(result.restored).toBe(true)
  })
})
