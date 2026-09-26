import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { addUserRole } from '@services/users/roles-permissions'
import {
  createTestUserDirect,
  hardDeleteTestUserAndWaitBeforeCommit,
  insertTestModerationReport,
  insertTestPost,
  safeUsername,
} from '@voucha/test-helpers'
import { createCriticalModerationAlertNotification } from './create-critical-moderation-alert-notification.mts'
import { listNotifications } from './list.mts'

describe('createCriticalModerationAlertNotification', () => {
  it('notifies all administrators and moderator users', async () => {
    const [admin, mod, regular, postOwner, reporter] = await Promise.all([
      createTestUserDirect({ username: safeUsername('cman-admin') }),
      createTestUserDirect({ username: safeUsername('cman-mod') }),
      createTestUserDirect({ username: safeUsername('cman-regular') }),
      createTestUserDirect({ username: safeUsername('cman-owner') }),
      createTestUserDirect({ username: safeUsername('cman-reporter') }),
    ])
    await Promise.all([addUserRole(admin!.id, 'administrator'), addUserRole(mod!.id, 'moderator')])

    const postId = await insertTestPost({
      createdById: postOwner!.id,
      slug: `cman-post-${randomUUID().slice(0, 8)}`,
      title: 'Critical alert test post',
      markdown: 'Body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter!.id,
      entityType: 'post',
      entityId: postId,
      reason: 'illegal_content',
    })

    await createCriticalModerationAlertNotification(reportId)

    const [adminNotifs, modNotifs, regularNotifs] = await Promise.all([
      listNotifications(admin!.id),
      listNotifications(mod!.id),
      listNotifications(regular!.id),
    ])

    const adminAlert = Object.values(adminNotifs.notifications).find(
      n => n.entity_type === 'critical_moderation_alert' && n.moderation_report_id === reportId,
    )
    const modAlert = Object.values(modNotifs.notifications).find(
      n => n.entity_type === 'critical_moderation_alert' && n.moderation_report_id === reportId,
    )
    const regularAlert = Object.values(regularNotifs.notifications).find(
      n => n.entity_type === 'critical_moderation_alert' && n.moderation_report_id === reportId,
    )

    expect(adminAlert).toBeDefined()
    expect(modAlert).toBeDefined()
    expect(regularAlert).toBeUndefined()

    expect(adminAlert?.title).toBe('Critical moderation alert')
    expect(adminAlert?.body).toBe('A report requiring urgent review has been filed.')
    expect(adminAlert?.target_path).toBe('/reports')
  })

  it('deduplicates repeated calls for the same report', async () => {
    const admin = await createTestUserDirect({
      username: safeUsername('cman-dedup'),
    })
    await addUserRole(admin!.id, 'administrator')

    const postOwner = await createTestUserDirect({
      username: safeUsername('cman-dedup-owner'),
    })
    const reporter = await createTestUserDirect({
      username: safeUsername('cman-dedup-reporter'),
    })
    const postId = await insertTestPost({
      createdById: postOwner!.id,
      slug: `cman-dedup-post-${randomUUID().slice(0, 8)}`,
      title: 'Dedup test post',
      markdown: 'Body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter!.id,
      entityType: 'post',
      entityId: postId,
      reason: 'illegal_content',
    })

    await createCriticalModerationAlertNotification(reportId)
    await createCriticalModerationAlertNotification(reportId)

    const { notifications } = await listNotifications(admin!.id)
    const alerts = Object.values(notifications).filter(
      n => n.entity_type === 'critical_moderation_alert' && n.moderation_report_id === reportId,
    )
    expect(alerts).toHaveLength(1)
  })

  it('does not fail when a staff user is hard-deleted during recipient selection', async () => {
    const admin = await createTestUserDirect({
      username: safeUsername('cman-delete-race'),
    })
    await addUserRole(admin!.id, 'administrator')

    const postOwner = await createTestUserDirect({
      username: safeUsername('cman-delete-race-owner'),
    })
    const reporter = await createTestUserDirect({
      username: safeUsername('cman-delete-race-reporter'),
    })
    const postId = await insertTestPost({
      createdById: postOwner!.id,
      slug: `cman-delete-race-post-${randomUUID().slice(0, 8)}`,
      title: 'Delete race test post',
      markdown: 'Body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter!.id,
      entityType: 'post',
      entityId: postId,
      reason: 'illegal_content',
    })

    let releaseDelete: () => void = () => {}
    const deleteMayCommit = new Promise<void>(resolve => {
      releaseDelete = resolve
    })
    let markDeleteHoldingLock: () => void = () => {}
    const deleteHoldingLock = new Promise<void>(resolve => {
      markDeleteHoldingLock = resolve
    })
    const deleteStarted = hardDeleteTestUserAndWaitBeforeCommit(
      admin!.id,
      deleteMayCommit,
      markDeleteHoldingLock,
    )

    await deleteHoldingLock
    const alertCreated = createCriticalModerationAlertNotification(reportId)
    releaseDelete()

    await expect(alertCreated).resolves.toBeUndefined()
    await deleteStarted
  })
})
