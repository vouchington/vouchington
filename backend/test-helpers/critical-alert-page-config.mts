import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { getNotificationRecipientDispatchPageHardMax } from '@queues/notifications/enqueues'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'

export { getNotificationRecipientDispatchPageHardMax }

/** Sets the recipient dispatcher to its reviewed maximum for bounded-page scenarios. */
export async function overrideCriticalAlertRecipientPageLimitForTest(): Promise<() => void> {
  await pagedDispatchConfig.waitForInitialization()
  return overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
    notifications_page_size: getNotificationRecipientDispatchPageHardMax(),
  })
}
