import { describe, expect, it } from 'vitest'
import { reconcileNotificationsForRssFeedItem } from './reconcile-rss-feed-item.mts'

describe('reconcileNotificationsForRssFeedItem', () => {
  it('does not leave reconciliation work behind for an absent RSS item', async () => {
    await expect(reconcileNotificationsForRssFeedItem(crypto.randomUUID())).resolves.toEqual({
      created: 0,
      pruned: 0,
    })
  })
})
