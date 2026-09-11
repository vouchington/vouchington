import { describe, expect, it } from 'vitest'
import {
  appendCandidateCursorClause,
  applyDeletedClusterLabel,
  clusterId,
  emptyIndicators,
  encodeClusterCursor,
  parseReasonBreakdown,
} from '../clustered-utils.mts'
import type { ClusterRow } from '../clustered-types.mts'
import { createTestSqlStatement } from '@voucha/test-helpers/sql-state'

describe('clustered moderation report utils', () => {
  it('builds default indicators and cluster ids', () => {
    expect(emptyIndicators()).toEqual({
      content_hash_duplicate: false,
      embeddings_similarity: false,
      velocity_spike: false,
    })
    expect(clusterId('post', 'post-1')).toBe('post:post-1')
  })

  it('parses reason breakdowns in shared report reason order', () => {
    expect(
      parseReasonBreakdown({
        harassment: 2,
        spam: 1,
        vote_manipulation: 3,
        other: 4,
      }),
    ).toEqual([
      { reason: 'spam', count: 1 },
      { reason: 'harassment', count: 2 },
      { reason: 'vote_manipulation', count: 3 },
      { reason: 'other', count: 4 },
    ])
  })

  it('hides deleted cluster targets', () => {
    expect(applyDeletedClusterLabel(makeClusterRow({ target_available: false }))).toEqual({
      target_label: '[deleted content]',
      target_content: null,
      target_path: null,
      admin_action_path: null,
    })
  })

  it('encodes entity-aware cluster cursors', () => {
    const cursor = encodeClusterCursor(makeClusterRow(), 'created_at_desc', 'pending', 'staff')
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))).toEqual({
      cluster: true,
      created_at: '2600-07-05T00:00:00.000000Z',
      entity_type: 'post',
      id: '11111111-1111-4111-8111-111111111111',
      sort: 'created_at_desc',
      status: 'pending',
      scope: 'staff',
    })
  })

  it('appends legacy cluster cursor clauses without entity type', () => {
    const query = createTestSqlStatement()

    appendCandidateCursorClause(
      query,
      {
        createdAt: '2600-07-05T00:00:00.000000Z',
        id: '11111111-1111-4111-8111-111111111111',
      },
      true,
    )

    expect(query.text).toContain('(c.sort_reported_at, c.entity_id) >')
  })
})

function makeClusterRow(overrides: Partial<ClusterRow> = {}): ClusterRow {
  return {
    entity_type: 'post',
    entity_id: '11111111-1111-4111-8111-111111111111',
    report_count: 1,
    reporter_count: 1,
    reason_counts: { spam: 1 },
    first_reported_at: new Date('2600-07-05T00:00:00.000Z'),
    last_reported_at: new Date('2600-07-05T00:00:00.000Z'),
    cursor_created_at: '2600-07-05T00:00:00.000000Z',
    target_label: 'Reported post',
    target_content: null,
    target_path: '/discussion/reported-post',
    admin_action_path: '/discussion/reported-post',
    target_user_id: '22222222-2222-4222-8222-222222222222',
    target_available: true,
    target_is_restricted: false,
    ...overrides,
  }
}
