import onError from '@modules/on-error'

export type PostCommitSettlement = {
  operations: PromiseSettledResult<unknown>[]
  observerErrors: unknown[]
  reportingErrors: unknown[]
}

export type PostCommitCompletion = {
  postId: string
  slug?: string | null
  kind: 'created' | 'updated'
  completion: Promise<PostCommitSettlement>
}

type CompletionListener = (event: PostCommitCompletion) => undefined
const listeners = new Set<CompletionListener>()

/** Register before the mutation; unsubscribe only after owned completions settle. */
export function onPostCommitCompletion(listener: CompletionListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** These operations start after commit; failures must not reject the durable response. */
export async function settlePostCommitEffects(
  identity: Omit<PostCommitCompletion, 'completion'>,
  operations: (() => Promise<unknown>)[],
  reportError: typeof onError = onError,
): Promise<void> {
  const started = operations.map(operation => {
    try {
      return Promise.resolve(operation())
    } catch (err) {
      const failure = Promise.withResolvers<unknown>()
      failure.reject(err)
      return failure.promise
    }
  })
  const observerErrors: unknown[] = []
  const reportingErrors: unknown[] = []
  const completion = Promise.allSettled(started).then(results => {
    const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
    for (const error of [...errors, ...observerErrors]) {
      try {
        reportError(
          error instanceof Error ? error : new Error('Post-commit effect failed', { cause: error }),
        )
      } catch (err) {
        reportingErrors.push(err)
      }
    }
    return { operations: results, observerErrors, reportingErrors }
  })
  const event = { ...identity, completion }
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch (err) {
      observerErrors.push(err)
    }
  }
  await completion
}
