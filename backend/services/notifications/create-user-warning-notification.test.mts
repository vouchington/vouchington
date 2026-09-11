import { it, expect, describe } from 'vitest'
import { createTestUserDirect, insertTestUserWarning } from '@voucha/test-helpers'
import { createUserWarningNotification } from './create-user-warning-notification.mts'
import { listNotifications } from './list.mts'

describe('create-user-warning-notification', () => {
  it('inserts a user_warning notification with /my/warnings target path', async () => {
    const user = await createTestUserDirect()
    const issuer = await createTestUserDirect()
    const warning = await insertTestUserWarning({
      userId: user.id,
      issuedById: issuer.id,
      reason: 'Test warning for notification',
    })

    await createUserWarningNotification(user.id, warning.id, null)

    const { notifications } = await listNotifications(user.id)
    const notif = Object.values(notifications).find(n => n.entity_type === 'user_warning')
    expect(notif).toBeDefined()
    expect(notif?.target_path).toBe('/my/warnings')
    expect(notif?.user_warning_id).toBe(warning.id)
  })

  it('uses publicMessage as notification body when provided', async () => {
    const user = await createTestUserDirect()
    const issuer = await createTestUserDirect()
    const warning = await insertTestUserWarning({
      userId: user.id,
      issuedById: issuer.id,
      reason: 'Test warning with public message',
    })
    const publicMessage = 'Please review the community guidelines.'

    await createUserWarningNotification(user.id, warning.id, publicMessage)

    const { notifications } = await listNotifications(user.id)
    const notif = Object.values(notifications).find(n => n.entity_type === 'user_warning')
    expect(notif).toBeDefined()
    expect(notif?.body).toBe(publicMessage)
  })
})
