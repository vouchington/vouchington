import { spawnSync } from 'node:child_process'
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
      20,
    ).then(
      () => undefined,
      (err: unknown) => err,
    )

    expect(err).toBeInstanceOf(SetupPhaseDeadlineError)
    expect(err).toHaveProperty(
      'message',
      expect.stringContaining('"dynamic-config:example" did not settle within 20ms'),
    )
  })

  it('keeps the process alive until a handle-less pending phase hits the deadline', () => {
    const helper = new URL('./vitest-setup-phase-deadline.mts', import.meta.url).href
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { withSetupPhaseDeadline } = await import(${JSON.stringify(helper)})
await withSetupPhaseDeadline('stuck-import', () => new Promise(() => {}), 50)`,
      ],
      { encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('SetupPhaseDeadlineError')
  })
})
