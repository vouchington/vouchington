type Outcome = { ok: true } | { ok: false; error: unknown }

/** Owns the test's committed projection IDs and exact returned claims, including failure paths. */
export function createStoryProjectionLifetime<Work extends { post_id: string }>(operations: {
  release: (work: Work) => Promise<void>
  drain: (postId: string) => Promise<void>
}) {
  const postIds = new Set<string>()
  const claims: { work: Work; release?: Promise<Outcome>; primary: boolean }[] = []
  let root: Promise<Outcome> | undefined
  let finishing: Promise<void> | undefined
  let sealed = false

  class ClaimReleaseFailure extends Error {
    readonly entry: (typeof claims)[number]
    readonly reason: unknown

    constructor(entry: (typeof claims)[number], reason: unknown) {
      super('Owned projection claim release failed', { cause: reason })
      this.entry = entry
      this.reason = reason
    }
  }

  function ownPost(postId: string) {
    if (sealed) throw new Error('Projection fixture ownership is already sealed')
    postIds.add(postId)
  }

  function release(entry: (typeof claims)[number]): Promise<Outcome> {
    entry.release ??= Promise.resolve()
      .then(() => operations.release(entry.work))
      .then(
        () => ({ ok: true }) as const,
        err => ({ ok: false, error: err }) as const,
      )
    return entry.release
  }

  async function withClaim(work: Work, action: () => Promise<void>): Promise<void> {
    if (sealed || !postIds.has(work.post_id)) {
      throw new Error('Cannot own or release an unregistered projection claim')
    }
    const entry = { work, primary: false } as (typeof claims)[number]
    claims.push(entry)
    let outcome: Outcome
    try {
      await action()
      outcome = { ok: true }
    } catch (err) {
      outcome = { ok: false, error: err }
    }
    const released = await release(entry)
    if (!outcome.ok) throw outcome.error
    if (!released.ok) {
      throw new ClaimReleaseFailure(entry, released.error)
    }
  }

  function run(action: () => Promise<void>): Promise<void> {
    if (root || finishing) throw new Error('Projection fixture root may only start once')
    root = Promise.resolve()
      .then(action)
      .then(
        () => ({ ok: true }) as const,
        err => {
          if (err instanceof ClaimReleaseFailure) {
            err.entry.primary = true
            return { ok: false, error: err.reason } as const
          }
          return { ok: false, error: err } as const
        },
      )
    return root.then(outcome => {
      if (!outcome.ok) throw outcome.error
      return undefined
    })
  }

  function finish(): Promise<void> {
    finishing ??= (async () => {
      const outcome = await (root ?? Promise.resolve({ ok: true } as const))
      sealed = true
      const errors: unknown[] = []
      for (const entry of claims) {
        const released = await release(entry)
        // Provenance, not reason identity, distinguishes the operation already thrown by run.
        if (!released.ok && !entry.primary) errors.push(released.error)
      }
      for (const postId of postIds) {
        try {
          await operations.drain(postId)
        } catch (err) {
          errors.push(err)
        }
      }
      if (errors.length > 0) {
        const ordered = outcome.ok ? errors : [outcome.error, ...errors]
        throw new AggregateError(ordered, 'Owned story projection cleanup failed', {
          cause: outcome.ok ? errors[0] : outcome.error,
        })
      }
    })()
    return finishing
  }

  return { ownPost, withClaim, run, finish }
}
