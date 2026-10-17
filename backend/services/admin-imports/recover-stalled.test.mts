import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createImportBatch } from './create-batch.mts'
import { recoverStalledAdminTopicImports } from './recover-stalled.mts'

describe('stalled admin topic import recovery', () => {
  it('re-dispatches a stalled batch once, then leaves it alone until it stalls again', async () => {
    const admin = await createTestUser({ administrator: true })
    const { batch } = await createImportBatch(admin, 'topic', [{ slug: `recover-${randomUUID()}` }])
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)
    const dispatched = () =>
      enqueueDispatches.mock.calls.filter(([ids]) => ids.includes(batch.id)).length

    // A sweep takes a bounded number of batches, oldest first, and marks each as touched; repeating
    // it reaches this batch however many unfinished ones the shared database holds.
    while (dispatched() === 0) {
      await recoverStalledAdminTopicImports({ staleAfterMs: 0, enqueueDispatches })
    }
    await recoverStalledAdminTopicImports({ enqueueDispatches })

    expect(dispatched()).toBe(1)
  })
})
