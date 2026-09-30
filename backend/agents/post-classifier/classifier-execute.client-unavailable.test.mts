import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createStructuredDecisionClient } from '@modules/structured-decisions'
import { readPostClassifierOutcomes } from '@services/post-classifier/application-read'
import { getPostClassifierApplicationFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { executePostClassifierOutcomes } from './classifier-execute.mts'

type Dependencies = Parameters<typeof executePostClassifierOutcomes>[1]

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

function expectAlarm(applicationId: string, postId: string, error: string) {
  expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
    'post_classifier_receipt_alarm',
    {
      level: 'error',
      fingerprint: ['post_classifier_receipt_alarm', 'client-unavailable'],
      tags: { reason: 'post_classifier_receipt_alarm', alarm_kind: 'client-unavailable' },
      extra: { postId, applicationId, error: expect.stringContaining(error) },
    },
  )
}

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

    await expect(executePostClassifierOutcomes(input, dependencies)).resolves.toBe('terminal')

    expect((await getPostClassifierApplicationFacts(input.post.id))[0]).toMatchObject({
      terminal_remote_failure_kind: 'client-unavailable',
      terminal_remote_failed_at: expect.any(Date),
      provider_attempts_started: 0,
      lease_token: null,
      outcomes_persisted_at: null,
      completed_at: null,
      local_flagged: true,
      local_classification: 'ai',
      local_detector: 'test-detector',
      local_detector_model_version: 'test-model',
    })
    expectAlarm(input.lease.applicationId, input.post.id, message)
    await expect(readPostClassifierOutcomes(input.lease)).resolves.toBeNull()
  })

  it('ends a remote-only receipt without inventing a local outcome', async () => {
    const input = await createPostClassifierExecutionFixture(true, false)

    await expect(
      executePostClassifierOutcomes(input, unavailableClient(failingClient)),
    ).resolves.toBe('terminal')

    expect((await getPostClassifierApplicationFacts(input.post.id))[0]).toMatchObject({
      terminal_remote_failure_kind: 'client-unavailable',
      local_flagged: null,
      local_detector: null,
    })
  })

  it('reports a receipt that already ended as stale, without a second alarm or write', async () => {
    const input = await createPostClassifierExecutionFixture()
    const dependencies = unavailableClient(failingClient)
    await expect(executePostClassifierOutcomes(input, dependencies)).resolves.toBe('terminal')
    const ended = (await getPostClassifierApplicationFacts(input.post.id))[0]

    await expect(executePostClassifierOutcomes(input, dependencies)).resolves.toBe('stale')

    expect(sentryCaptureMessageMock).toHaveBeenCalledOnce()
    expect((await getPostClassifierApplicationFacts(input.post.id))[0]).toEqual(ended)
  })

  it('keeps a mismatched local outcome from ending the remote half', async () => {
    const input = await createPostClassifierExecutionFixture()
    const dependencies = unavailableClient(failingClient)
    const detect = dependencies.detectLocal
    dependencies.detectLocal = async (text, options) => ({
      ...(await detect(text, options)),
      confidence_threshold: 0,
    })

    await expect(executePostClassifierOutcomes(input, dependencies)).rejects.toThrow(
      'local outcome does not match',
    )

    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
    expect((await getPostClassifierApplicationFacts(input.post.id))[0]).toMatchObject({
      lease_token: input.lease.leaseToken,
      terminal_remote_failure_kind: null,
      terminal_remote_failed_at: null,
      local_flagged: null,
    })
  })
})
