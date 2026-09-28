import type { Notification } from '@/types/api-responses'

export type NotificationListNotification = Pick<
  Notification,
  'id' | 'entity_type' | 'title' | 'body' | 'read_at' | 'created_at' | 'target_path'
> &
  Partial<Pick<Notification, 'target_entity' | 'target_intent'>>
