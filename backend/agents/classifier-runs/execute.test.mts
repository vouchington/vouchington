import { describe, expect, it, vi } from 'vitest'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import { leaseSyntheticRun } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { completeClassifierRun } from '@services/classifier-runs'
import { executeClassifierRun, type ClassifierRunInputs } from './execute.mts'

type LocalOnlyInputs = ClassifierRunInputs<{ version: number }, never>

/** The only thing a new classifier owes the executor: how to build its input. */
function localOnlyInputs(): LocalOnlyInputs {
  return {
    buildRemoteInput: vi.fn<LocalOnlyInputs['buildRemoteInput']>(async () => null),
    createClient: vi.fn<LocalOnlyInputs['createClient']>(() => {
      throw new Error('a local-only run never builds a provider client')
    }),
  }
}

describe('executeClassifierRun for a classifier other than C5 (real PG)', () => {
  it('persists a local-only run once and replays it without rebuilding any input', async () => {
    const setup = await createSyntheticFixture()
    const { lease } = await leaseSyntheticRun(setup)
    const inputs = localOnlyInputs()
    const input = { lease, maxAttempts: 3, signal: new AbortController().signal }

    await expect(executeClassifierRun(setup.adapter, input, inputs)).resolves.toBe('persisted')
    await expect(executeClassifierRun(setup.adapter, input, inputs)).resolves.toBe('replay')

    expect(inputs.buildRemoteInput).toHaveBeenCalledTimes(1)
    expect(inputs.createClient).not.toHaveBeenCalled()
    expect(await completeClassifierRun(setup.adapter, lease)).toMatchObject({ kind: 'completed' })
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toMatchObject([
      { provider_attempts_started: 0, completed_at: expect.any(Date), lease_token: null },
    ])
  })

  it('rejects a non-positive provider attempt limit before touching the run', async () => {
    const setup = await createSyntheticFixture()
    const { lease } = await leaseSyntheticRun(setup)
    const inputs = localOnlyInputs()

    await expect(
      executeClassifierRun(
        setup.adapter,
        { lease, maxAttempts: 0, signal: new AbortController().signal },
        inputs,
      ),
    ).rejects.toThrow('attempt limit must be positive')

    expect(inputs.buildRemoteInput).not.toHaveBeenCalled()
    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toMatchObject([
      { outcomes_persisted_at: null },
    ])
  })

  it('stops on an aborted signal before persisting any outcome', async () => {
    const setup = await createSyntheticFixture()
    const { lease } = await leaseSyntheticRun(setup)
    const controller = new AbortController()
    controller.abort(new Error('worker shutting down'))

    await expect(
      executeClassifierRun(
        setup.adapter,
        { lease, maxAttempts: 3, signal: controller.signal },
        localOnlyInputs(),
      ),
    ).rejects.toThrow('worker shutting down')

    expect(await getClassifierRunFacts(setup.post.id, setup.slug)).toMatchObject([
      { outcomes_persisted_at: null, terminal_failed_at: null },
    ])
  })
})
