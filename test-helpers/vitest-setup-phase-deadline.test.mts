import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupPhaseDeadlineError, withSetupPhaseDeadline } from './vitest-setup-phase-deadline.mts'

describe('withSetupPhaseDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the phase result and leaves no pending deadline timer', async () => {
    await expect(withSetupPhaseDeadline('seed', async () => 'done', 1000)).resolves.toBe('done')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propagates the phase failure and clears the deadline timer', async () => {
    const failure = new Error('connect refused')

    await expect(
      withSetupPhaseDeadline(
        'seed',
        () => {
          throw failure
        },
        1000,
      ),
    ).rejects.toBe(failure)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('fails a never-settling phase with an error that names it', async () => {
    const outcome = withSetupPhaseDeadline(
      'dynamic-config:example',
      () => new Promise(() => {}),
      1000,
    ).then(
      () => undefined,
      (err: unknown) => err,
    )

    await vi.advanceTimersByTimeAsync(999)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)

    const err = await outcome
    expect(err).toBeInstanceOf(SetupPhaseDeadlineError)
    expect(err).toHaveProperty(
      'message',
      expect.stringContaining('"dynamic-config:example" did not settle within 1000ms'),
    )
  })
})
