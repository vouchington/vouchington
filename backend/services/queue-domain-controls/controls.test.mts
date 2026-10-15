import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { queueDomainControlsPubSub } from '@data-stores/valkey-pubsub'
import { createTestUser } from '@voucha/test-helpers'
import {
  insertPausedQueueDomainControlForTest,
  removeQueueDomainControlsForTest,
} from '../../test-helpers/queue-domain-controls.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueueConfig } from '@queues/background/config'
import {
  getQueueDomainControl,
  isQueueDomainPaused,
  listQueueDomainControls,
  pauseQueueDomain,
  resumeQueueDomain,
  watchQueueDomainControls,
} from './index.mts'
import { invalidateQueueDomainPause } from './pause-cache.mts'

// Synthetic domain ids keep these rows apart from the registered domains other tests run workers for.
const createdDomains: string[] = []
function newDomain(): string {
  const domain = `test-${randomUUID()}`
  createdDomains.push(domain)
  return domain
}

describe('queue domain controls', () => {
  afterAll(async () => {
    await removeQueueDomainControlsForTest(createdDomains)
    await queueDomainControlsPubSub.closeSubscriber()
  })

  it('reports an unknown domain as running and lists only domains with a control row', async () => {
    const domain = newDomain()

    await expect(getQueueDomainControl(domain)).resolves.toEqual({
      domain,
      paused: false,
      pausedAt: null,
      pausedBy: null,
      reason: null,
    })
    expect((await listQueueDomainControls()).map(control => control.domain)).not.toContain(domain)
  })

  it('pauses with the staff user and reason, keeps the first pause on a repeat, and resumes', async () => {
    const domain = newDomain()
    const first = await createTestUser()
    const second = await createTestUser()

    const paused = await pauseQueueDomain(domain, { userId: first.id, reason: 'upstream outage' })
    const repeated = await pauseQueueDomain(domain, { userId: second.id, reason: 'again' })

    expect(paused).toMatchObject({
      domain,
      paused: true,
      pausedBy: first.id,
      reason: 'upstream outage',
    })
    expect(paused.pausedAt).toEqual(expect.any(String))
    expect(repeated).toEqual(paused)
    expect(await listQueueDomainControls()).toContainEqual(paused)

    await expect(resumeQueueDomain(domain)).resolves.toMatchObject({ domain, paused: false })
    await expect(getQueueDomainControl(domain)).resolves.toMatchObject({
      paused: false,
      pausedBy: null,
      reason: null,
    })
  })

  it('serves the cached state until a change is published, then reads the new state', async () => {
    const domain = newDomain()
    const user = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(backgroundQueueConfig, {
      pause_cache_ms: 60_000,
    })
    const invalidated = Promise.withResolvers<string>()
    const watcher = await watchQueueDomainControls(changed => {
      if (changed === domain) invalidated.resolve(changed)
    })
    try {
      await expect(isQueueDomainPaused(domain)).resolves.toBe(false)

      // A pause written without publishing: this process still trusts the entry it cached.
      await insertPausedQueueDomainControlForTest(domain)
      await expect(isQueueDomainPaused(domain)).resolves.toBe(false)

      // The published change clears the entry on its own, without waiting out the cache lifetime.
      await pauseQueueDomain(domain, { userId: user.id })
      await invalidated.promise
      await expect(isQueueDomainPaused(domain)).resolves.toBe(true)

      await resumeQueueDomain(domain)
      invalidateQueueDomainPause(domain)
      await expect(isQueueDomainPaused(domain)).resolves.toBe(false)
    } finally {
      await watcher.close()
      restore()
    }
  })
})
