import { describe, expect, it } from 'vitest'
import { addAccumulatedTokens, runWithJobTokenAccumulator } from './token-accumulator.mts'

describe('token-accumulator', () => {
  it('reports the summed total of every addAccumulatedTokens call made during fn', async () => {
    const reported: number[] = []

    const result = await runWithJobTokenAccumulator(
      async () => {
        addAccumulatedTokens(120)
        addAccumulatedTokens(55)
        return 'done'
      },
      async totalTokens => {
        reported.push(totalTokens)
      },
    )

    expect(result).toBe('done')
    expect(reported).toEqual([175])
  })

  it('does not call onSettled when fn accumulates no tokens', async () => {
    const reported: number[] = []

    await runWithJobTokenAccumulator(
      async () => 'done',
      async totalTokens => {
        reported.push(totalTokens)
      },
    )

    expect(reported).toEqual([])
  })

  it('reports whatever was accumulated before fn throws, then rethrows unchanged', async () => {
    const reported: number[] = []
    const thrown = new Error('boom')

    await expect(
      runWithJobTokenAccumulator(
        async () => {
          addAccumulatedTokens(42)
          throw thrown
        },
        async totalTokens => {
          reported.push(totalTokens)
        },
      ),
    ).rejects.toBe(thrown)

    expect(reported).toEqual([42])
  })

  it('is a no-op outside an active scope, so a stray call never throws', () => {
    expect(() => addAccumulatedTokens(10)).not.toThrow()
  })

  it('propagates the original error from fn, not onSettled rejecting, when both fail', async () => {
    const thrownByFn = new Error('boom from fn')

    // onSettled rejecting here models job.reportTokens() hitting a transient Valkey blip. A bare
    // `finally { await onSettled(...) }` would let this replace thrownByFn -- exactly the failure
    // mode that would hide a real OpenAI rate-limit error from handleOpenAIRateLimit downstream.
    await expect(
      runWithJobTokenAccumulator(
        async () => {
          addAccumulatedTokens(5)
          throw thrownByFn
        },
        async () => {
          throw new Error('onSettled rejected -- e.g. reportTokens Valkey blip')
        },
      ),
    ).rejects.toBe(thrownByFn)
  })

  it("still resolves with fn's return value when onSettled rejects on an otherwise-successful job", async () => {
    const result = await runWithJobTokenAccumulator(
      async () => {
        addAccumulatedTokens(5)
        return 'done'
      },
      async () => {
        throw new Error('onSettled rejected -- e.g. reportTokens Valkey blip')
      },
    )

    expect(result).toBe('done')
  })

  it('isolates concurrent scopes via AsyncLocalStorage instead of sharing one counter', async () => {
    const reported: Record<string, number> = {}
    const firstScopeStarted = Promise.withResolvers<void>()
    const releaseFirstScope = Promise.withResolvers<void>()

    await Promise.all([
      runWithJobTokenAccumulator(
        async () => {
          addAccumulatedTokens(1000)
          firstScopeStarted.resolve()
          await releaseFirstScope.promise
          addAccumulatedTokens(1)
        },
        async totalTokens => {
          reported.a = totalTokens
        },
      ),
      runWithJobTokenAccumulator(
        async () => {
          await firstScopeStarted.promise
          try {
            addAccumulatedTokens(7)
          } finally {
            releaseFirstScope.resolve()
          }
        },
        async totalTokens => {
          reported.b = totalTokens
        },
      ),
    ])

    // If the accumulator were a single module-level counter instead of per-scope storage, both
    // scopes would observe each other's writes and neither total below would hold.
    expect(reported.a).toBe(1001)
    expect(reported.b).toBe(7)
  })
})
