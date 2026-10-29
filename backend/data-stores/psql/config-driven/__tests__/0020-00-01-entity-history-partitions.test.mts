import { describe, expect, it } from 'vitest'
import createRevisionPartitions from '../0020-00-01-entity-history-partitions.mts'

describe('revision partition bootstrap', () => {
  it('creates topic revision monthly children without a default-only path', () => {
    const statements = createRevisionPartitions()
    expect(statements).toContain('PARTITION OF topic_revisions')
    expect(statements).toContain('FOR VALUES FROM')
    expect(statements).not.toContain('topic_revisions__default')
    expect(statements).toContain('PARTITION OF post_revisions DEFAULT')
  })
})
