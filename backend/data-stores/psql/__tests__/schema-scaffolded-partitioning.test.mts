import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { getPartitionRows } from '../test-helpers/election-schema.mts'

const DEFERRED_RANGE_LEDGER_TABLES = ['ai_usage_records', 'post_clearance_changes']
const USER_KEY_RANGE_TABLES = [
  ['conversation_messages', 'conversation_id'],
  ['notifications', 'user_id'],
  ['web_push_subscriptions', 'user_id'],
  ['post_feed_shares', 'recipient_user_id'],
  ['rss_feed_item_feed_shares', 'recipient_user_id'],
  ['rss_feed_item_read_states', 'user_id'],
  ['post_read_states', 'user_id'],
] as const

describe('deferred-partition scaffolding', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('range-partitions each growth ledger on id with one DEFAULT child', async () => {
    const rows = await getPartitionRows(DEFERRED_RANGE_LEDGER_TABLES)

    for (const table of DEFERRED_RANGE_LEDGER_TABLES) {
      expect(rows.filter(row => row.table_name === table)).toEqual([
        {
          table_name: table,
          strategy: 'r',
          partition_key: 'RANGE (id)',
          child_name: `${table}__default`,
          child_bound: 'DEFAULT',
        },
      ])
    }
  })

  it('range-partitions each user-key growth table with one DEFAULT child', async () => {
    const rows = await getPartitionRows(USER_KEY_RANGE_TABLES.map(([table]) => table))

    for (const [table, partitionKey] of USER_KEY_RANGE_TABLES) {
      expect(rows.filter(row => row.table_name === table)).toEqual([
        {
          table_name: table,
          strategy: 'r',
          partition_key: `RANGE (${partitionKey})`,
          child_name: `${table}__default`,
          child_bound: 'DEFAULT',
        },
      ])
    }
  })
})
