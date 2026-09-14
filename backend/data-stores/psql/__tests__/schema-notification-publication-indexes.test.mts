import { describe, expect, it } from 'vitest'
import {
  getNotificationPushEndpointUpdateAction,
  listNotificationPublicationIndexes,
} from '../../../test-helpers/data-stores/psql/notification-publication-indexes.mts'

describe('notification publication schema', () => {
  it('indexes both retained publication targets on the partitioned parent', async () => {
    const rows = await listNotificationPublicationIndexes()

    expect(rows).toEqual([
      {
        indexname: 'idx_notifications__publication_post_id',
        indexdef: expect.stringContaining(
          'USING btree (publication_post_id) WHERE (publication_post_id IS NOT NULL)',
        ),
      },
      {
        indexname: 'idx_notifications__publication_rss_feed_item_id',
        indexdef: expect.stringContaining(
          'USING btree (publication_rss_feed_item_id) WHERE (publication_rss_feed_item_id IS NOT NULL)',
        ),
      },
    ])
  })

  it('cascades rotated notification IDs through endpoint receipts', async () => {
    await expect(getNotificationPushEndpointUpdateAction()).resolves.toBe('CASCADE')
  })
})
