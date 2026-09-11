import { describe, expect, it } from 'vitest'
import { renderMarkdownBatch } from '../batch-render.mts'

describe('renderMarkdownBatch partitioning', () => {
  it('renders admin and non-admin partitions with distinct options and preserves order', async () => {
    const adminId = 'partition-test-admin-1'
    const adminIds = new Set([adminId])

    const result = await renderMarkdownBatch(
      [
        { id: 'a', markdown: '<b>user-1</b>', created_by_id: 'user-1' },
        { id: 'b', markdown: '<b>admin-1</b>', created_by_id: adminId },
        { id: 'c', markdown: '<b>user-2</b>', created_by_id: 'user-2' },
        { id: 'd', markdown: '<b>admin-2</b>', created_by_id: adminId },
      ],
      adminIds,
    )

    // Admin: HTML passes through
    expect(result['b']).toContain('<b>admin-1</b>')
    expect(result['d']).toContain('<b>admin-2</b>')

    // Non-admin: HTML escaped
    expect(result['a']).toContain('&lt;b&gt;user-1&lt;/b&gt;')
    expect(result['c']).toContain('&lt;b&gt;user-2&lt;/b&gt;')

    // All 4 keys present
    expect(result).toHaveProperty('a')
    expect(result).toHaveProperty('b')
    expect(result).toHaveProperty('c')
    expect(result).toHaveProperty('d')
  }, 30_000)

  it('admin gets dofollow links, non-admin gets nofollow', async () => {
    const adminId = 'partition-test-admin-2'
    const adminIds = new Set([adminId])

    const entities = [
      { id: 'admin', markdown: '[link](https://example.com)', created_by_id: adminId },
      { id: 'user', markdown: '[link](https://example.com)', created_by_id: 'regular-user' },
    ]
    const result = await renderMarkdownBatch(entities, adminIds)

    expect(result['admin']).not.toContain('nofollow')
    expect(result['user']).toContain('nofollow')
  }, 30_000)

  it('renders all as non-admin when adminUserIds is empty set', async () => {
    const entities = [{ id: '1', markdown: '<em>one</em>', created_by_id: 'some-user' }]
    const result = await renderMarkdownBatch(entities, new Set())

    expect(result['1']).toContain('&lt;em&gt;one&lt;/em&gt;')
  }, 30_000)

  it('handles all-admin entities', async () => {
    const adminId = 'partition-test-admin-3'
    const adminIds = new Set([adminId])

    const entities = [
      { id: '1', markdown: '<em>one</em>', created_by_id: adminId },
      { id: '2', markdown: '<em>two</em>', created_by_id: adminId },
    ]
    const result = await renderMarkdownBatch(entities, adminIds)

    expect(result['1']).toContain('<em>one</em>')
    expect(result['2']).toContain('<em>two</em>')
  }, 30_000)
})
