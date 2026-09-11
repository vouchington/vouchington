import { describe, expect, it } from 'vitest'
import { buildCommentAncestorPageQuery } from './ancestor-page.mts'

describe('ancestor-page.generated', () => {
  it('uses a bounded recursive window plus one rootward sentinel', () => {
    const query = buildCommentAncestorPageQuery({
      maxReturnedDepth: 5,
      rootId: '123e4567-e89b-12d3-a456-426614174000',
      startId: '123e4567-e89b-12d3-a456-426614174001',
    })

    expect(query.sql).toContain('ancestor_window.depth <')
    expect(query.values).toContain(6)
    expect(query.sql).toContain('ancestor_window.id !=')
    expect(query.sql.match(/posts\.root_id =/g)).toHaveLength(2)
  })
})
