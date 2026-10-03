import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { loadPostWriteThread } from './write-thread.mts'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'

describe('delegated write ancestry hydration', () => {
  it('hydrates a deep ordered ancestry in one batch on the supplied transaction', async () => {
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
    expect(result.posts.map(post => post.id)).toEqual(ids)
    expect(queries.filter(item => item.text.includes('getPostsByAnyBatch'))).toHaveLength(1)
    expect(queries.filter(item => item.text.includes('getPostByAny'))).toHaveLength(1)
  })
})
