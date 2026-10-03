import type { ArticleSyncResult } from '@voucha/types/article-sync'
import { createChannelPubSub } from './channel-pubsub.mts'

export type ArticleSyncStatus = {
  status: 'completed' | 'failed'
  result?: ArticleSyncResult
  error?: string
}

export const articleSyncPubSub = createChannelPubSub<ArticleSyncStatus>('article-sync:status')
