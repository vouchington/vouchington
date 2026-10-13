import { onTestFinished } from 'vitest'
import {
  onPostCommitCompletion,
  type PostCommitCompletion,
} from '../services/posts/post-commit-completion.mts'

/** Inspect expected producer failures while still draining every started owned completion. */
export async function withPostCommitFailureObservation<T>(
  postId: string,
  install: (restore: (cleanup: () => void) => void) => void,
  start: () => Promise<T>,
  verify: (
    result: T,
    events: readonly PostCommitCompletion[],
    run: <R>(start: () => Promise<R>) => Promise<R>,
  ) => Promise<void>,
): Promise<T> {
  const events: PostCommitCompletion[] = []
  const restorers: (() => void)[] = []
  const errors: unknown[] = []
  const actions: Promise<PromiseSettledResult<unknown>[]>[] = []
  let cleanup: Promise<void> | undefined
  let off = () => {}
  let closed = false
  function run<R>(start: () => Promise<R>): Promise<R> {
    if (closed) return Promise.reject(new Error('Post-commit fault owner is closed'))
    const action = start()
    actions.push(Promise.allSettled([action]))
    return action
  }
  const finish = () =>
    (cleanup ??= (async () => {
      closed = true
      let drained = 0
      while (drained < actions.length) {
        const batch = actions.slice(drained)
        drained += batch.length
        const outcomes = (await Promise.all(batch)).flat()
        errors.push(
          ...outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [outcome.reason] : [])),
        )
      }
      let consumed = 0
      while (consumed < events.length) {
        const batch = events.slice(consumed)
        consumed += batch.length
        const outcomes = await Promise.allSettled(batch.map(event => event.completion))
        errors.push(
          ...outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [outcome.reason] : [])),
        )
      }
      off()
      for (const restore of restorers.toReversed()) {
        try {
          restore()
        } catch (err) {
          errors.push(err)
        }
      }
    })())
  onTestFinished(async () => {
    closed = true
    await finish()
    if (errors.length) throw new AggregateError(errors, 'Post-commit fault teardown failed')
  })
  off = onPostCommitCompletion(event => {
    if (event.postId === postId) events.push(event)
    return undefined
  })
  let failed = false
  let primary: unknown
  let result: T | undefined
  try {
    install(restore => restorers.push(restore))
    result = await run(start)
    if (closed) throw new Error('Post-commit fault action resumed after teardown')
    await verify(result, events, run)
  } catch (err) {
    failed = true
    primary = err
  } finally {
    await finish()
  }
  if (errors.length)
    return Promise.reject(
      new AggregateError(
        failed ? [primary, ...errors] : errors,
        'Post-commit fault assertion or cleanup failed',
        { cause: failed ? primary : errors[0] },
      ),
    )
  if (failed) {
    const failure = Promise.withResolvers<T>()
    failure.reject(primary)
    return failure.promise
  }
  return result!
}
