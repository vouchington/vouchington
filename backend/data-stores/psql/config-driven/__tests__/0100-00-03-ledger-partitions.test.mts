import { describe, expect, it } from 'vitest'
import createLedgerPartitions from '../0100-00-03-ledger-partitions.mts'

describe('ledger partition generation', () => {
  it('creates the default partition for every deferred-RANGE growth ledger', () => {
    const sql = createLedgerPartitions()

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_usage_records__default')
    expect(sql).toContain('PARTITION OF ai_usage_records DEFAULT')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS post_clearance_changes__default')
    expect(sql).toContain('PARTITION OF post_clearance_changes DEFAULT')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS session_referral_attributions__default')
    expect(sql).toContain('PARTITION OF session_referral_attributions DEFAULT')
  })
})
