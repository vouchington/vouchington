import { createChannelPubSub } from './channel-pubsub.mts'

export type ArticleSyncStatus = {
  status: 'completed' | 'failed'
  result?: unknown
  error?: string
}

export const articleSyncPubSub = createChannelPubSub<ArticleSyncStatus>('article-sync:status')
