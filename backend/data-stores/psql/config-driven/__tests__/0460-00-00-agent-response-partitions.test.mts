import { describe, expect, it } from 'vitest'
import createAgentResponsePartitions from '../0460-00-00-agent-response-partitions.mts'

describe('createAgentResponsePartitions', () => {
  it('returns a non-empty SQL string', () => {
    const sql = createAgentResponsePartitions()
    expect(typeof sql).toBe('string')
    expect(sql.length).toBeGreaterThan(0)
  })

  it('includes agent_responses partition statements', () => {
    const sql = createAgentResponsePartitions()
    expect(sql).toContain('agent_responses')
  })

  it('produces valid SQL containing CREATE TABLE IF NOT EXISTS', () => {
    const sql = createAgentResponsePartitions()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS')
  })
})
