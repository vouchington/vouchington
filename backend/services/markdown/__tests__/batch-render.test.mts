import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'
import { renderMarkdownBatch } from '../batch-render.mts'

const randomHex = () => randomBytes(4).toString('hex')

describe('renderMarkdownBatch', () => {
  it('renders multiple markdown strings to HTML', async () => {
    const entities = [
      { id: '1', markdown: '# Hello' },
      { id: '2', markdown: '**Bold**' },
    ]
    const result = await renderMarkdownBatch(entities)

    expect(result['1']).toContain('<h1>Hello</h1>')
    expect(result['2']).toContain('<strong>Bold</strong>')
  }, 30_000)

  it('handles empty markdown array', async () => {
    const result = await renderMarkdownBatch([])
    expect(result).toEqual({})
  }, 30_000)

  it('handles entities with empty markdown', async () => {
    const entities = [
      { id: '1', markdown: '' },
      { id: '2', markdown: '   ' },
      { id: '3', markdown: 'Valid content' },
    ]
    const result = await renderMarkdownBatch(entities)

    expect(result['1']).toBe('')
    expect(result['2']).toBe('')
    expect(result['3']).toContain('Valid content')
  }, 30_000)

  it('resolves @username mentions using real DB users', async () => {
    const username = `testbatch${randomHex()}`
    const user = await createTestUserDirect({ username })

    const entities = [{ id: '1', markdown: `Hello @${user!.username}` }]
    const result = await renderMarkdownBatch(entities)

    expect(result['1']).toContain(`href="/user/${user!.username}"`)
    expect(result['1']).toContain('md-link-user')
  }, 30_000)

  it('resolves #topic mentions using real DB topics', async () => {
    const slug = `test-batch-topic-${randomHex()}`
    const creator = await createTestUserDirect({ username: `testbatch${randomHex()}` })
    await insertTestTopic({
      name: `Test Batch Topic ${randomHex()}`,
      slug,
      createdById: creator!.id,
    })

    const entities = [{ id: '1', markdown: `Check #${slug}` }]
    const result = await renderMarkdownBatch(entities)

    expect(result['1']).toContain(`href="/topics/${slug}"`)
    expect(result['1']).toContain('md-link-topic')
  }, 30_000)

  it('batches mention resolution across all entities', async () => {
    const usernameA = `testbatch${randomHex()}`
    const usernameB = `testbatch${randomHex()}`
    const userA = await createTestUserDirect({ username: usernameA })
    const userB = await createTestUserDirect({ username: usernameB })

    const entities = [
      { id: '1', markdown: `Hello @${userA!.username}` },
      { id: '2', markdown: `Hi @${userB!.username} and @${userA!.username}` },
    ]
    const result = await renderMarkdownBatch(entities)

    expect(result['1']).toContain(`href="/user/${userA!.username}"`)
    expect(result['2']).toContain(`href="/user/${userB!.username}"`)
    expect(result['2']).toContain(`href="/user/${userA!.username}"`)
  }, 30_000)

  it('leaves unresolved mentions as plain text', async () => {
    const entities = [{ id: '1', markdown: 'Hello @nonexistentuser999xyz' }]
    const result = await renderMarkdownBatch(entities)

    // Unresolved mention should appear as raw text (not a link)
    expect(result['1']).not.toContain('<a ')
    expect(result['1']).toContain('@nonexistentuser999xyz')
  }, 30_000)

  it('renders admin entities with allowHtml and dofollow links', async () => {
    const adminId = 'admin-batch-test-1'
    const userId = 'user-batch-test-1'
    const adminIds = new Set([adminId])

    const entities = [
      { id: '1', markdown: '<b>admin</b> [link](https://example.com)', created_by_id: adminId },
      { id: '2', markdown: '<b>user</b> [link](https://example.com)', created_by_id: userId },
    ]
    const result = await renderMarkdownBatch(entities, adminIds)

    // Admin entity: HTML allowed, dofollow
    expect(result['1']).toContain('<b>admin</b>')
    expect(result['1']).not.toContain('nofollow')

    // Non-admin entity: HTML escaped, nofollow
    expect(result['2']).toContain('&lt;b&gt;user&lt;/b&gt;')
    expect(result['2']).toContain('nofollow')
  }, 30_000)

  it('renders all with nofollow when no adminUserIds provided', async () => {
    const entities = [
      { id: '1', markdown: '[link](https://example.com)', created_by_id: 'any-user-1' },
      { id: '2', markdown: '[link](https://example.com)', created_by_id: 'any-user-2' },
    ]
    const result = await renderMarkdownBatch(entities)

    expect(result['1']).toContain('nofollow')
    expect(result['2']).toContain('nofollow')
  }, 30_000)

  it('proxies external images for both admin and non-admin', async () => {
    const adminId = 'admin-proxy-test-1'
    const adminIds = new Set([adminId])

    const entities = [
      { id: '1', markdown: '![img](https://example.com/admin.jpg)', created_by_id: adminId },
      { id: '2', markdown: '![img](https://example.com/user.jpg)', created_by_id: 'other-user' },
    ]
    const result = await renderMarkdownBatch(entities, adminIds)

    expect(result['1']).toContain('/sideload/')
    expect(result['1']).not.toContain('https://example.com/admin.jpg')
    expect(result['2']).toContain('/sideload/')
    expect(result['2']).not.toContain('https://example.com/user.jpg')
  }, 30_000)
})
