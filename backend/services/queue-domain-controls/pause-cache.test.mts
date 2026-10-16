import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueueConfig } from '@queues/background/config'
import {
  insertPausedQueueDomainControlForTest,
  removeQueueDomainControlsForTest,
} from '../../test-helpers/queue-domain-controls.mts'
import { invalidateQueueDomainPause, isQueueDomainPaused } from './pause-cache.mts'

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

  it('does not cache an answer that a published change overtook while it was being read', async () => {
    const domain = newDomain()
    const restore = overrideDynamicConfigFieldsForTest(backgroundQueueConfig, {
      pause_cache_ms: 60_000,
    })
    try {
      const stale = isQueueDomainPaused(domain)
      invalidateQueueDomainPause(domain)
      await expect(stale).resolves.toBe(false)

      // Written without publishing: only a fresh read sees it, because the stale answer was dropped.
      await insertPausedQueueDomainControlForTest(domain)
      await expect(isQueueDomainPaused(domain)).resolves.toBe(true)
    } finally {
      restore()
    }
  })
})
