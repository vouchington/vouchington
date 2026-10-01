import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStructuredDecisionClient } from '@modules/structured-decisions'
import { readClassifierRunOutcomes } from '@services/classifier-runs'
import { getClassifierRunFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { getPostClassifierLocalOutcomeFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/run-facts'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { executePostClassifierRun } from './classifier-execute.mts'

type Dependencies = Parameters<typeof executePostClassifierRun>[1]

function unavailableClient(createClient: Dependencies['createClient']): Dependencies {
  return {
    detectLocal: async (_text, { confidenceThreshold }) => ({
      flagged: true,
      reason: 'Detected',
      confidence_score: 0.99,
      confidence_threshold: confidenceThreshold,
      classification: 'ai',
      detector: 'test-detector',
      detector_model_version: 'test-model',
    }),
    createClient,
  }
}

const blankKeyClient: Dependencies['createClient'] = hooks =>
  createStructuredDecisionClient({
    transport: 'openrouter',
    apiKey: '',
    hooks,
    fetch: async () => new Response('unexpected provider call', { status: 500 }),
  })

const failingClient: Dependencies['createClient'] = () => {
  throw new Error('provider client construction failed')
}

function expectAlarm(runId: string, error: string) {
  expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith('classifier_run_alarm', {
    level: 'error',
    fingerprint: ['classifier_run_alarm', 'client-unavailable', POST_CLASSIFIER_SLUG],
    tags: {
      reason: 'classifier_run_alarm',
      alarm_kind: 'client-unavailable',
      classifier: POST_CLASSIFIER_SLUG,
    },
    extra: { classifier: POST_CLASSIFIER_SLUG, runId, error: expect.stringContaining(error) },
  })
}

const facts = async (input: { post: { id: string } }) =>
  (await getClassifierRunFacts(input.post.id, POST_CLASSIFIER_SLUG))[0]!

describe('post classifier execution when the provider client cannot be built', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it.each([
    ['a blank API key', blankKeyClient, 'API key is required'],
    ['any construction failure', failingClient, 'provider client construction failed'],
  ])('ends the remote half and keeps the local outcome for %s', async (_name, create, message) => {
    const input = await createPostClassifierExecutionFixture()
    const dependencies = unavailableClient(create)

    await expect(executePostClassifierRun(input, dependencies)).resolves.toBe('terminal')

    expect(await facts(input)).toMatchObject({
      terminal_failure_kind: 'client-unavailable',
      terminal_failed_at: expect.any(Date),
      provider_attempts_started: 0,
      lease_token: null,
      outcomes_persisted_at: null,
      completed_at: null,
    })
    expect(await getPostClassifierLocalOutcomeFacts(input.run.runId)).toMatchObject({
      flagged: true,
      classification: 'ai',
      detector: 'test-detector',
      detector_model_version: 'test-model',
    })
    expectAlarm(input.run.runId, message)
    await expect(readClassifierRunOutcomes(input.adapter, input.lease)).resolves.toBeNull()
  })

  it('ends a remote-only run without inventing a local outcome', async () => {
    const input = await createPostClassifierExecutionFixture(true, false)

    await expect(executePostClassifierRun(input, unavailableClient(failingClient))).resolves.toBe(
      'terminal',
    )

    expect(await facts(input)).toMatchObject({ terminal_failure_kind: 'client-unavailable' })
    expect(await getPostClassifierLocalOutcomeFacts(input.run.runId)).toBeNull()
  })

  it('reports a run that already ended as stale, without a second alarm or write', async () => {
    const input = await createPostClassifierExecutionFixture()
    const dependencies = unavailableClient(failingClient)
    await expect(executePostClassifierRun(input, dependencies)).resolves.toBe('terminal')
    const ended = await facts(input)

    await expect(executePostClassifierRun(input, dependencies)).resolves.toBe('stale')

    expect(sentryCaptureMessageMock).toHaveBeenCalledOnce()
    expect(await facts(input)).toEqual(ended)
  })

  it('keeps a mismatched local outcome from ending the remote half', async () => {
    const input = await createPostClassifierExecutionFixture()
    const dependencies = unavailableClient(failingClient)
    const detect = dependencies.detectLocal
    dependencies.detectLocal = async (text, options) => ({
      ...(await detect(text, options)),
      confidence_threshold: 0,
    })

    await expect(executePostClassifierRun(input, dependencies)).rejects.toThrow(
      'local outcome does not match',
    )

    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
    expect(await facts(input)).toMatchObject({
      lease_token: input.lease.leaseToken,
      terminal_failure_kind: null,
      terminal_failed_at: null,
    })
    expect(await getPostClassifierLocalOutcomeFacts(input.run.runId)).toBeNull()
  })
})
