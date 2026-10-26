import type { MessageKey } from '@ts-shared/ui-messages'

export type BookmarkFamily =
  | 'saved'
  | 'hidden'
  | 'viewed-items'
  | 'viewed-sources'
  | 'following'
  | 'muted'
  | 'blocked'
  | 'subscribed'
  | 'import-export'

interface BookmarkBreadcrumb {
  name: MessageKey
  path: string
}

export interface BookmarkRouteConfig {
  family: BookmarkFamily | null
  path: string
  title: MessageKey
  description: MessageKey
  breadcrumb: BookmarkBreadcrumb
}
