import type { WebPushSubscription } from '@/types/api-responses'

export type NotificationPushSubscription = Pick<WebPushSubscription, 'id' | 'endpoint'>
