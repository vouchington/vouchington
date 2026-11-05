import { describe, expect, it } from 'vitest'
import { flagLabelQuery } from './flag-label-query.mts'

describe('flagLabelQuery', () => {
  it('selects report flags and reported-user labels', () => {
    const query = flagLabelQuery('report', [crypto.randomUUID()])
    expect(query.text).toContain('FROM report_integrity_flags f')
    expect(query.text).toContain('target_profile.id = f.reported_user_id')
  })

  it('selects vote flags and canonical topic labels', () => {
    const query = flagLabelQuery('vote', [crypto.randomUUID()])
    expect(query.text).toContain('FROM vote_integrity_flags f')
    expect(query.text).toContain('topic_label_destination.id')
  })

  it('rejects an unsupported persisted flag domain', () => {
    expect(() => flagLabelQuery('unknown' as 'report', [])).toThrow(
      'Unsupported integrity flag domain: unknown',
    )
  })
})
