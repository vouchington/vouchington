import {
  optionArgs,
  callRejectedMcpTool,
  callStructuredMcpTool,
} from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it, onTestFinished } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import {
  createFollowNotification,
  hasNotification,
  listNotifications,
} from '@services/notifications'
import { notificationsWorkConfig } from '@services/notifications/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processMarkAllNotificationsRead } from '../../workers/notifications/processors.mts'
import deleteNotificationTool from '../delete-notification.mts'
import markNotificationReadTool from '../mark-notification-read.mts'

const SCOPES = ['notifications:read', 'notifications:write'] as const

async function createCaller() {
  return { ...(await createTestUser()), membership_plan: 'plus' as const }
}

// A follow notification for the recipient, from a fresh actor.
async function createNotificationFor(recipientId: string): Promise<string> {
  const actor = await createTestUser()
  const [created] = await createFollowNotification(recipientId, actor.id, actor.username)
  return created!.id
}

const readAt = async (userId: string, id: string) =>
  (await listNotifications(userId)).results.find(row => row.id === id)?.read_at ?? null

async function queuedDeletions(userId: string, notificationId: string) {
  const jobs = await readAllQueueJobs(notifications)
  return jobs.filter(
    job =>
      job.name === 'notifications.processDeleteNotification' &&
      (job.data as { userId?: string; notificationId?: string }).userId === userId &&
      (job.data as { notificationId?: string }).notificationId === notificationId,
  )
}

describe('notification tools contract — real DB', () => {
  it('mark_notifications_read.one marks only that notification and repeats without changing it', async () => {
    const caller = await createCaller()
    const target = await createNotificationFor(caller.id)
    const other = await createNotificationFor(caller.id)

    expect(
      await callStructuredMcpTool(
        caller,
        'mark_notifications_read',
        optionArgs('one', { notification_id: target }),
        SCOPES,
      ),
    ).toEqual({ success: true })
    const firstReadAt = await readAt(caller.id, target)
    expect(
      await callStructuredMcpTool(
        caller,
        'mark_notifications_read',
        optionArgs('one', { notification_id: target }),
        SCOPES,
      ),
    ).toEqual({ success: true })

    expect(firstReadAt).not.toBeNull()
    expect(await readAt(caller.id, target)).toEqual(firstReadAt)
    expect(await readAt(caller.id, other)).toBeNull()
  })

  it('mark_notifications_read.one does what PATCH /api/v1/my/notifications/:id does', async () => {
    const caller = await createCaller()
    const viaRest = await createNotificationFor(caller.id)
    const viaTool = await createNotificationFor(caller.id)
    const request = createRequest()
    await request.authenticateAs(caller)
    await request.patch(`/api/v1/my/notifications/${viaRest}`).expect(204)

    await callStructuredMcpTool(
      caller,
      'mark_notifications_read',
      optionArgs('one', { notification_id: viaTool }),
      SCOPES,
    )

    expect(await readAt(caller.id, viaRest)).not.toBeNull()
    expect(await readAt(caller.id, viaTool)).not.toBeNull()
  })

  it('mark_notifications_read.all reports how many changed and leaves other users alone', async () => {
    const caller = await createCaller()
    const bystander = await createTestUser()
    const mine = await Promise.all([
      createNotificationFor(caller.id),
      createNotificationFor(caller.id),
    ])
    const theirs = await createNotificationFor(bystander.id)

    const first = await callStructuredMcpTool(
      caller,
      'mark_notifications_read',
      optionArgs('all', {}),
      SCOPES,
    )
    const again = await callStructuredMcpTool(
      caller,
      'mark_notifications_read',
      optionArgs('all', {}),
      SCOPES,
    )

    expect(first).toEqual({ success: true, marked_read: 2, has_more: false })
    expect(again).toEqual({ success: true, marked_read: 0, has_more: false })
    for (const id of mine) expect(await readAt(caller.id, id)).not.toBeNull()
    expect(await readAt(bystander.id, theirs)).toBeNull()
  })

  it('REST and MCP mark bounded pages and report the same remaining work', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, { mark_all_read_page_size: 2 }),
    )
    const caller = await createCaller()
    const mine = await Promise.all(
      Array.from({ length: 5 }, () => createNotificationFor(caller.id)),
    )
    const request = createRequest()
    await request.authenticateAs(caller)

    const restFirst = await request.post('/api/v1/my/notifications/read-all').expect(200)
    expect(restFirst.body).toEqual({ success: true, marked_read: 2, has_more: true })
    expect(
      (await Promise.all(mine.map(id => readAt(caller.id, id)))).filter(x => x === null),
    ).toHaveLength(3)

    const mcpNext = await callStructuredMcpTool(
      caller,
      'mark_notifications_read',
      optionArgs('all', {}),
      SCOPES,
    )
    expect(mcpNext).toEqual({ success: true, marked_read: 2, has_more: true })

    const restLast = await request.post('/api/v1/my/notifications/read-all').expect(200)
    expect(restLast.body).toEqual({ success: true, marked_read: 1, has_more: false })
    expect(
      await callStructuredMcpTool(caller, 'mark_notifications_read', optionArgs('all', {}), SCOPES),
    ).toEqual({ success: true, marked_read: 0, has_more: false })
    for (const id of mine) expect(await readAt(caller.id, id)).not.toBeNull()
  })

  it('background continuation advances one page per job within the original upper ID', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, { mark_all_read_page_size: 2 }),
    )
    const caller = await createCaller()
    const mine = await Promise.all(
      Array.from({ length: 5 }, () => createNotificationFor(caller.id)),
    )
    const request = createRequest()
    await request.authenticateAs(caller)

    expect((await request.post('/api/v1/my/notifications/read-all').expect(200)).body).toEqual({
      success: true,
      marked_read: 2,
      has_more: true,
    })
    const later = await createNotificationFor(caller.id)
    const continuationJobs = async () =>
      (await readAllQueueJobs(notifications)).filter(
        job =>
          job.name === 'notifications.processMarkAllNotificationsRead' &&
          (job.data as { userId?: string }).userId === caller.id,
      )
    const [first] = await continuationJobs()
    expect(first).toBeDefined()
    const data = first!.data as { userId: string; throughId: string; lastPageId: string }
    expect(await processMarkAllNotificationsRead(data)).toMatchObject({
      marked_read: 2,
      has_more: true,
      through_id: data.throughId,
    })
    const jobs = await continuationJobs()
    expect(jobs).toHaveLength(2)
    const next = jobs.find(job => job.id !== first!.id)
    expect(next).toBeDefined()
    expect(
      await processMarkAllNotificationsRead(
        next!.data as { userId: string; throughId: string; lastPageId: string },
      ),
    ).toMatchObject({ marked_read: 1, has_more: false })
    for (const id of mine) expect(await readAt(caller.id, id)).not.toBeNull()
    expect(await readAt(caller.id, later)).toBeNull()
  })

  it('delete_notification queues the deletion the REST route queues, and repeats safely', async () => {
    const caller = await createCaller()
    const viaTool = await createNotificationFor(caller.id)
    const viaRest = await createNotificationFor(caller.id)
    const request = createRequest()
    await request.authenticateAs(caller)
    await request.delete(`/api/v1/my/notifications/${viaRest}`).expect(204)

    expect(
      await callStructuredMcpTool(
        caller,
        'delete_notification',
        { notification_id: viaTool },
        SCOPES,
      ),
    ).toEqual({ success: true })
    expect(
      await callStructuredMcpTool(
        caller,
        'delete_notification',
        { notification_id: viaTool },
        SCOPES,
      ),
    ).toEqual({ success: true })

    const [toolJob] = await queuedDeletions(caller.id, viaTool)
    const [restJob] = await queuedDeletions(caller.id, viaRest)
    expect(toolJob?.opts).toMatchObject({
      priority: restJob?.opts.priority,
      deduplication: {
        id: `processDeleteNotification__${caller.id}__${viaTool}`,
        mode: 'debounce',
      },
    })
    expect(await hasNotification(caller.id, viaTool)).toBe(true)
  })

  it('never reaches another user’s notification, and a missing one is not found', async () => {
    const caller = await createCaller()
    const owner = await createTestUser()
    const foreign = await createNotificationFor(owner.id)
    const missing = crypto.randomUUID()

    for (const id of [foreign, missing]) {
      await expect(
        markNotificationReadTool.function(caller)({ notification_id: id }),
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        deleteNotificationTool.function(caller)({ notification_id: id }),
      ).rejects.toMatchObject({ status: 404 })
    }
    expect(
      await callRejectedMcpTool(
        caller,
        'delete_notification',
        { notification_id: foreign },
        SCOPES,
      ),
    ).toContain('Notification not found')

    expect(await readAt(owner.id, foreign)).toBeNull()
    expect(await queuedDeletions(owner.id, foreign)).toEqual([])
  })

  it.each([
    ['mark_notifications_read', optionArgs('one', { notification_id: 'nope' })],
    ['mark_notifications_read', optionArgs('one', {})],
    ['delete_notification', { notification_id: 'nope' }],
    ['delete_notification', { notification_id: crypto.randomUUID(), user_id: crypto.randomUUID() }],
    ['mark_notifications_read', optionArgs('all', { user_id: crypto.randomUUID() })],
  ])('refuses invalid %s arguments before any change', async (name, args) => {
    const caller = await createCaller()
    const notificationId = await createNotificationFor(caller.id)

    expect(await callRejectedMcpTool(caller, name, args, SCOPES)).toContain(
      'Invalid tool arguments',
    )
    expect(await readAt(caller.id, notificationId)).toBeNull()
  })
})
