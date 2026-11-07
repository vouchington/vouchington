import { describe, expect, it } from 'vitest'
import generateHostnameElectionsIndexes from '../0190-00-00-hostname-elections-indexes.mts'

describe('0190-00-00-hostname-elections-indexes', () => {
  it('generates the topic and public trust-sort indexes for url_hostnames', () => {
    const sql = generateHostnameElectionsIndexes()
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_url_hostnames__topic_id__votes_score_sort__id/,
    )
    expect(sql).toContain('ON url_hostnames (topic_id, votes_score_sort DESC, id DESC)')
    expect(sql).toContain('idx_url_hostnames__public_votes_score_sort__id')
    expect(sql).toContain('ON url_hostnames (votes_score_sort DESC, id DESC)')
    expect(sql).not.toContain('votes_count_up')
  })
})
