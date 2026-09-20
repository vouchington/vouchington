import { describe, expect, it, vi } from 'vitest'
import { enqueueOrRetryCopyrightEmailIntake } from './copyright-email-intake.mts'

describe('copyright email intake enqueue recovery', () => {
  it('retries a retained failed extraction job', async () => {
    const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightEmailIntake('intake-id', {
      getJob: vi
        .fn<
          () => Promise<{
            name: string
            getState(): Promise<string>
            retry(): Promise<void>
            remove(): Promise<void>
          }>
        >()
        .mockResolvedValue({
          name: 'copyright-email-intake',
          getState: async () => 'failed',
          retry,
          remove: async () => undefined,
        }),
      enqueue,
    })

    expect(retry).toHaveBeenCalledOnce()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
