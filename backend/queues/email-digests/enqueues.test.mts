import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { enqueueDispatchCommunityModerationSummaryEmails } from './enqueues.mts'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'

describe('moderation digest dispatcher admissions', () => {
  it('deduplicates each inspected-user continuation independently', async () => {
    const firstId = randomUUID()
    const secondId = randomUUID()
    const first = await readEnqueuedJob(
      backgroundQueue,
      await enqueueDispatchCommunityModerationSummaryEmails({ afterId: firstId }),
    )
    const second = await readEnqueuedJob(
      backgroundQueue,
      await enqueueDispatchCommunityModerationSummaryEmails({ afterId: secondId }),
    )
    onTestFinished(async () => {
      await Promise.all([first.remove(), second.remove()])
    })
    await expect(
      enqueueDispatchCommunityModerationSummaryEmails({ afterId: firstId }),
    ).resolves.toBeNull()
    expect(first.data).toEqual({ afterId: firstId })
    expect(second.data).toEqual({ afterId: secondId })
    expect(first.id).not.toBe(second.id)
  })
})
