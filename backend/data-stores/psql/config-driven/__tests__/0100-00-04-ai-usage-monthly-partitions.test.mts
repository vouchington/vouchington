import { describe, expect, it } from 'vitest'
import createAiUsageMonthlyPartitions from '../0100-00-04-ai-usage-monthly-partitions.mts'

describe('AI usage monthly bootstrap', () => {
  it('creates explicit id ranges without a default child', () => {
    const statements = createAiUsageMonthlyPartitions()
    expect(statements).toContain('CREATE TABLE IF NOT EXISTS ai_usage_records__p_')
    expect(statements).toContain('PARTITION OF ai_usage_records')
    expect(statements).toContain('FOR VALUES FROM')
    expect(statements).not.toContain('ai_usage_records__default')
  })
})
