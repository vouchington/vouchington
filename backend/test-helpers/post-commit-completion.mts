import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { createTestUser } from './entities/users.mts'
import { insertTestPost } from './entities/posts.mts'
import { getPostByAny } from '../services/posts/get.mts'
export async function drainOwnedTestAction<T>(
  start: () => Promise<T>,
  release: () => void,
  body: (operation: Promise<T>) => Promise<void>,
): Promise<T> {
  let failed = false
  let primary: unknown
  const cleanupErrors: unknown[] = []
  let closed = false
  let operation: Promise<T> | undefined
  let settlement: Promise<PromiseSettledResult<T>[]> | undefined
  let cleanup: Promise<void> | undefined
  const finish = () =>
    (cleanup ??= (async () => {
      try {
        release()
      } catch (err) {
        cleanupErrors.push(err)
      }
      if (settlement) {
        const [result] = await settlement
        if (result?.status === 'rejected') cleanupErrors.push(result.reason)
      }
    })())
  onTestFinished(async () => {
    closed = true
    await finish()
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Owned action teardown failed')
  })
  try {
    operation = start()
    settlement = Promise.allSettled([operation])
    await body(operation)
    if (closed) throw new Error('Owned test body resumed after teardown')
  } catch (err) {
    failed = true
    primary = err
  } finally {
    await finish()
  }
  const [settled] = settlement ? await settlement : []
  if (cleanupErrors.length)
    return Promise.reject(
      new AggregateError(
        failed ? [primary, ...cleanupErrors] : cleanupErrors,
        'Action and settlement failed',
        { cause: failed ? primary : cleanupErrors[0] },
      ),
    )
  if (failed || !settled || settled.status === 'rejected') {
    const failure = Promise.withResolvers<T>()
    failure.reject(settled?.status === 'rejected' && !failed ? settled.reason : primary)
    return failure.promise
  }
  return settled.value
}

export async function createPostCompletionFixture() {
  const creator = await createTestUser()
  const slug = `post-completion-${randomUUID()}`
  const id = await insertTestPost({
    title: 'Owned completion',
    slug,
    createdById: creator.id,
    markdown: 'Owned content.',
    clearanceStatus: 'approved',
  })
  const post = await getPostByAny(id)
  if (!post) throw new Error('Owned post fixture was not read back')
  return { creator, post }
}
