import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueueConfig } from '@queues/background/config'
import { removeQueueDomainControlsForTest } from '../../test-helpers/queue-domain-controls.mts'
import { pauseQueueDomain } from './write.mts'
import { isQueueDomainPaused, watchQueueDomainControls } from './pause-cache.mts'

// Synthetic domain ids keep these rows apart from the registered domains other tests run workers for.
const createdDomains: string[] = []
function newDomain(): string {
  const domain = `test-${randomUUID()}`
  createdDomains.push(domain)
  return domain
}

describe('queue domain pause cache', () => {
  afterAll(() => removeQueueDomainControlsForTest(createdDomains))

  it('shares one read between concurrent callers for a domain', async () => {
    const domain = newDomain()
    const restore = overrideDynamicConfigFieldsForTest(backgroundQueueConfig, {
      pause_cache_ms: 60_000,
    })
    try {
      const first = isQueueDomainPaused(domain)
      const second = isQueueDomainPaused(domain)

      expect(second).toBe(first)
      await expect(first).resolves.toBe(false)
    } finally {
      restore()
    }
  })

  it('clears a cached answer when a queue domain change is published', async () => {
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

      await pauseQueueDomain(domain, { userId: user.id })
      await expect(invalidated.promise).resolves.toBe(domain)
      await expect(isQueueDomainPaused(domain)).resolves.toBe(true)
    } finally {
      await watcher.close()
      restore()
    }
  })
})
