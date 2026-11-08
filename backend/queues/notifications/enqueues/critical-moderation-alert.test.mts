import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PRIORITY_DISPATCH } from '@queues/background/config'
import { notifications } from '../queues.mts'
import { enqueueContinueCriticalModerationAlertNotification } from './critical-moderation-alert.mts'

describe('critical moderation alert enqueue', () => {
  it('uses report-and-user cursor identity for recipient continuations', async () => {
    const reportId = randomUUID()
    const afterUserId = randomUUID()
    const nextAfterUserId = randomUUID()
    const data = { reportId, afterUserId }
    await enqueueContinueCriticalModerationAlertNotification(data)
    await enqueueContinueCriticalModerationAlertNotification(data)
    await enqueueContinueCriticalModerationAlertNotification({
      reportId,
      afterUserId: nextAfterUserId,
    })

    const job = await notifications.getJob(
      `notifications__critical-moderation-alert__${reportId}__${afterUserId}`,
    )
    const nextPage = await notifications.getJob(
      `notifications__critical-moderation-alert__${reportId}__${nextAfterUserId}`,
    )
    expect(job?.name).toBe('notifications.processCriticalModerationAlertNotification')
    expect(job?.data).toEqual(data)
    expect(job?.opts).toMatchObject({
      priority: PRIORITY_DISPATCH,
      removeOnComplete: true,
      removeOnFail: true,
      ordering: {
        key: `notifications:bulk:critical-moderation-alert:${reportId}`,
        concurrency: 1,
      },
    })
    expect(nextPage?.id).not.toBe(job?.id)
    expect(nextPage?.data).toEqual({ reportId, afterUserId: nextAfterUserId })
  })
})
