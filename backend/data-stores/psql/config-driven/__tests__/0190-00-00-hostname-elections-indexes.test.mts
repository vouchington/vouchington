import { describe, expect, it } from 'vitest'
import generateHostnameElectionsIndexes from '../0190-00-00-hostname-elections-indexes.mts'

describe('0190-00-00-hostname-elections-indexes', () => {
  it('generates top-sort indexes for url_hostnames vote columns', () => {
    const sql = generateHostnameElectionsIndexes()
    expect(sql).toContain('idx_url_hostnames__top_sort')
    expect(sql).toContain('idx_url_hostnames__top_sort_by_topic')
    expect(sql).toContain('ON url_hostnames (votes_score_sort DESC, id DESC)')
    expect(sql).toContain('ON url_hostnames (topic_id, votes_score_sort DESC, id DESC)')
    expect(sql).toContain('votes_count_up')
  })

  it('generates CREATE INDEX IF NOT EXISTS statements', () => {
    const sql = generateHostnameElectionsIndexes()
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/)
  })
})
