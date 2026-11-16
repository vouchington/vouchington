import { renderListedNotification } from '@services/notifications/render-listed-notification'
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

    await createUserWarningNotification(user.id, warning.id)

    const { notifications } = await listNotifications(user.id)
    const notif = Object.values(notifications).find(n => n.entity_type === 'user_warning')
    expect(notif).toBeDefined()
    expect(notif?.target_path).toBe('/my/warnings')
    expect(notif?.user_warning_id).toBe(warning.id)
  })

  it('renders the warning public message as the body when one was written', async () => {
    const user = await createTestUserDirect()
    const issuer = await createTestUserDirect()
    const publicMessage = 'Please review the community guidelines.'
    const warning = await insertTestUserWarning({
      userId: user.id,
      issuedById: issuer.id,
      reason: 'Test warning with public message',
      publicMessage,
    })

    await createUserWarningNotification(user.id, warning.id)

    const page = await listNotifications(user.id)
    const notif = Object.values(page.notifications).find(n => n.entity_type === 'user_warning')
    expect(notif).toBeDefined()
    expect(renderListedNotification(page, notif!.id).body).toBe(publicMessage)
  })
})
