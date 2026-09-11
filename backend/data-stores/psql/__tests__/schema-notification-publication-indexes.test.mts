import { describe, expect, it } from 'vitest'
import { read } from '@data-stores/psql'

describe('notification publication schema', () => {
  it('indexes both retained publication targets on the partitioned parent', async () => {
    const { rows } = await read<{ indexdef: string; indexname: string }>(`
      /* listNotificationPublicationIndexes */ SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'notifications'
        AND indexname IN (
          'idx_notifications__publication_post_id',
          'idx_notifications__publication_rss_feed_item_id'
        )
      ORDER BY indexname
    `)

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
    const { rows } = await read<{ update_action: string }>(`
      /* getNotificationPushEndpointUpdateAction */
      SELECT CASE constraint_record.confupdtype
        WHEN 'c' THEN 'CASCADE'
        ELSE constraint_record.confupdtype::text
      END AS update_action
      FROM pg_constraint constraint_record
      WHERE constraint_record.conrelid = 'notification_push_intent_subscription_receipts'::regclass
        AND constraint_record.contype = 'f'
        AND constraint_record.confrelid = 'notification_push_intents'::regclass
    `)

    expect(rows).toEqual([{ update_action: 'CASCADE' }])
  })
})
