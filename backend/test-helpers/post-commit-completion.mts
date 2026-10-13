import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { createTestUser } from './entities/users.mts'
import { insertTestPost } from './entities/posts.mts'
import { getPostByAny } from '../services/posts/get.mts'
import {
  onPostCommitCompletion,
  type PostCommitCompletion,
} from '../services/posts/post-commit-completion.mts'

/** Observe the real producer before execution and drain a growing owned ledger on every path. */
export async function withOwnedPostCommitCompletions<T>(
  ownedSlugs: ReadonlySet<string>,
  action: () => Promise<T>,
  verify: (result: T, events: readonly PostCommitCompletion[]) => Promise<void>,
  release: () => void = () => {},
): Promise<T> {
  const events: PostCommitCompletion[] = []
  const cleanupErrors: unknown[] = []
  let closed = false
  let unsubscribe = () => {}
  let actionSettlement: Promise<PromiseSettledResult<T>[]> | undefined
  let cleanup: Promise<void> | undefined
  const finish = () =>
    (cleanup ??= (async () => {
      try {
        release()
      } catch (err) {
        cleanupErrors.push(err)
      }
      if (actionSettlement) await actionSettlement
      let consumed = 0
      while (consumed < events.length) {
        const batch = events.slice(consumed)
        consumed += batch.length
        const settlements = await Promise.allSettled(batch.map(event => event.completion))
        for (const settlement of settlements) {
          if (settlement.status === 'rejected') {
            cleanupErrors.push(settlement.reason)
            continue
          }
          cleanupErrors.push(
            ...settlement.value.operations.flatMap(operation =>
              operation.status === 'rejected' ? [operation.reason] : [],
            ),
          )
          cleanupErrors.push(
            ...settlement.value.observerErrors,
            ...settlement.value.reportingErrors,
          )
        }
      }
      unsubscribe()
    })())
  onTestFinished(async () => {
    closed = true
    await finish()
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Owned post-commit teardown failed')
  })
  unsubscribe = onPostCommitCompletion(event => {
    if (event.slug && ownedSlugs.has(event.slug)) events.push(event)
    return undefined
  })
  let failed = false
  let primary: unknown
  let result: T | undefined
  try {
    const operation = action()
    actionSettlement = Promise.allSettled([operation])
    result = await operation
  } catch (err) {
    failed = true
    primary = err
  } finally {
    await finish()
  }
  if (failed || cleanupErrors.length) {
    if (failed && !cleanupErrors.length) {
      const failure = Promise.withResolvers<T>()
      failure.reject(primary)
      return failure.promise
    }
    return Promise.reject(
      new AggregateError(
        failed ? [primary, ...cleanupErrors] : cleanupErrors,
        'Owned post-commit operation or drain failed',
        { cause: failed ? primary : cleanupErrors[0] },
      ),
    )
  }
  // The successful action determines the returned value; undefined is a valid generic result.
  if (closed) throw new Error('Owned completion action resumed after test teardown')
  await verify(result!, events)
  return result!
}

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
