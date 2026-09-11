import { describe, expect, it } from 'vitest'
import { enqueueHeartbeat } from '../enqueues.mts'

describe('enqueues.generated', () => {
  it('enqueueHeartbeat enqueues without error', async () => {
    await expect(enqueueHeartbeat()).resolves.toBeDefined()
  })

  it('enqueueHeartbeat accepts optional data', async () => {
    await expect(enqueueHeartbeat({ id: 'test', enqueuedAt: 1000 })).resolves.toBeDefined()
  })
})
