import { describe, expect, it } from 'vitest'
import createUserSessionPartitions from '../0530-00-01-user-session-partitions.mts'

describe('user session partition generation', () => {
  it('creates the default user_sessions partition', () => {
    const sql = createUserSessionPartitions()

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_sessions__default')
    expect(sql).toContain('PARTITION OF user_sessions DEFAULT')
  })
})
