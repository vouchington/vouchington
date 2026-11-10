import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { loadPostWriteThread } from './write-thread.mts'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { withHeldPostUpdateForTest } from '@voucha/test-helpers/post-write-context'
import { lockDelegatedPostThread } from './delegated-write-locks.mts'

describe('delegated write context hydration', () => {
  it('reads only root, immediate parent and target regardless of thread depth', async () => {
    const user = await createTestUser()
    const root = await insertTestPost({
      title: 'Root',
      slug: crypto.randomUUID(),
      markdown: 'Root',
      createdById: user.id,
    })
    const ids = [root]
    for (let index = 0; index < 8; index++)
      ids.push(
        await insertTestPost({
          postType: 'comment',
          title: '',
          slug: crypto.randomUUID(),
          markdown: 'Reply',
          createdById: user.id,
          rootId: root,
          parentId: ids.at(-1)!,
        }),
      )
    const { result, queries } = await withPostgresTransactionForTest(query =>
      withCapturedTestQueries(() => loadPostWriteThread(ids.at(-1)!, { query })),
    )
    expect(result.posts.map(post => post.id)).toEqual([root, ids.at(-2), ids.at(-1)])
    expect(result.nodes).toHaveLength(3)
    expect(queries.some(item => item.text.includes('WITH RECURSIVE'))).toBe(false)
    expect(queries.some(item => /FOR (?:NO KEY )?UPDATE|pg_advisory/.test(item.text))).toBe(false)
    expect(queries.filter(item => item.text.includes('getPostsByAnyBatch'))).toHaveLength(1)
    expect(queries.filter(item => item.text.includes('getPostByAny'))).toHaveLength(1)
    await withHeldPostUpdateForTest(root, () =>
      withPostgresTransactionForTest(query => lockDelegatedPostThread(query, ids.at(-1)!)),
    )
  })
})
