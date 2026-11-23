import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  getTestPostDeletedAt,
  insertTestPost,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { interceptPostgresTransactionsForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { deletePost } from './delete.mts'
import { getPostByAny } from './get.mts'

describe('delegated post deletion', () => {
  it('refuses a delegated deletion that matched no post before the actor was reinstated', async () => {
    const user = await createTestUser()
    const id = await insertTestPost({
      title: 'Delegated deletion during suspension',
      slug: crypto.randomUUID(),
      markdown: 'Retained content',
      createdById: user.id,
    })
    const post = await getPostByAny(id, { readOnly: false })
    if (!post) throw new Error('Expected test post')
    onTestFinished(
      interceptPostgresTransactionsForTest(
        transaction =>
          new Proxy(transaction, {
            async apply(target, thisArgument, args: Parameters<typeof transaction>) {
              const [statement, values] = args
              if (
                typeof statement !== 'string' ||
                !statement.includes('/* deletePost */') ||
                values?.[1] !== id
              ) {
                return Reflect.apply(target, thisArgument, args)
              }
              await suspendTestUser(user.id)
              try {
                return await Reflect.apply(target, thisArgument, args)
              } finally {
                await unsuspendTestUser(user.id)
              }
            },
          }),
      ),
    )

    const [deletion] = await Promise.allSettled([deletePost(user, post, { delegated: true })])
    await expect(getTestPostDeletedAt(id)).resolves.toBeNull()
    expect(deletion).toMatchObject({ status: 'rejected', reason: { status: 401 } })
  })
})
