import type { MutableRefObject } from 'react'
import type { UpdateNotificationSetting } from './notification-settings-types'
import { isSupportedTimeZone } from './notification-settings-utils'

export function autoResolveModerationTimezone({
  resolved,
  resolving,
  updateNotificationSetting,
}: {
  resolved: MutableRefObject<boolean>
  resolving: MutableRefObject<boolean>
  updateNotificationSetting: UpdateNotificationSetting
}) {
  if (resolved.current || resolving.current) return
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!isSupportedTimeZone(browserTimeZone)) return
  resolving.current = true
  void updateNotificationSetting('moderation_email_timezone', browserTimeZone, true, true).then(
    persisted => {
      resolving.current = false
      resolved.current = persisted
    },
  )
}
