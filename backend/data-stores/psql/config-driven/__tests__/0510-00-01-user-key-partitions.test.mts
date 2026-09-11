import { describe, expect, it } from 'vitest'
import createUserKeyPartitions from '../0510-00-01-user-key-partitions.mts'
import { USER_KEY_PARTITION_TABLES } from '../utils/partition-config.mts'

describe('user-key partition generation', () => {
  it('creates one default partition for every registered user-key table', () => {
    const sql = createUserKeyPartitions()

    for (const table of USER_KEY_PARTITION_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}__default`)
      expect(sql).toContain(`PARTITION OF ${table} DEFAULT`)
    }
    expect(sql.match(/PARTITION OF/g)).toHaveLength(USER_KEY_PARTITION_TABLES.length)
  })
})
