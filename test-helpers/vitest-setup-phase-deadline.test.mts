import { describe, expect, it } from 'vitest'
import { SetupPhaseDeadlineError, withSetupPhaseDeadline } from './vitest-setup-phase-deadline.mts'

describe('withSetupPhaseDeadline', () => {
  it('returns the phase result', async () => {
    await expect(withSetupPhaseDeadline('seed', async () => 'done', 60_000)).resolves.toBe('done')
  })

  it('propagates the phase failure', async () => {
    const failure = new Error('connect refused')

    await expect(
      withSetupPhaseDeadline(
        'seed',
        () => {
          throw failure
        },
        60_000,
      ),
    ).rejects.toBe(failure)
  })

  it('fails a never-settling phase with an error that names it', async () => {
    const err = await withSetupPhaseDeadline(
      'dynamic-config:example',
      () => new Promise(() => {}),
      1,
    ).then(
      () => undefined,
      (err: unknown) => err,
    )

    expect(err).toBeInstanceOf(SetupPhaseDeadlineError)
    expect(err).toHaveProperty(
      'message',
      expect.stringContaining('"dynamic-config:example" did not settle within 1ms'),
    )
  })
})
