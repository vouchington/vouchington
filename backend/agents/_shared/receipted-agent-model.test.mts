import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { getOpenAIResponseAttemptHooks } from '@modules/openai-utils/create-response'
import { resolveAnthropicCredentials } from '@modules/model-providers/anthropic-client'
import { ModelProviderError } from '@modules/model-providers/errors'
import { assertSupportedRequest } from '@modules/model-providers/generate'
import { callOpenAIJson } from '@modules/model-providers/openai-generate'
import { spendCapConfig } from '@services/ai-usage/spend-cap-config'
import { getAgentCallReceipt } from '@services/ai-usage/agent-call-receipts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  makeModelCallResult,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { agentCallOperationKey, callReceiptedAgentModel } from './receipted-agent-model.mts'

describe('paid agent receipt after a free-capacity retry is blocked', () => {
  it('releases the known-unbilled reservation so the job can resume after the cap clears', async () => {
    await spendCapConfig.waitForInitialization()
    const restoreAdmission = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const operationId = randomUUID()
    const params = {
      agentSlug: 'story-post',
      operationId,
      promptVersion: 'story-post-test-v1',
      selection: TEST_OPENAI_SELECTION,
      input: 'One fixed story prompt',
      safetyIdentifier: operationId,
    }
    try {
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: async () => {
            const hooks = getOpenAIResponseAttemptHooks()
            if (!hooks) throw new Error('OpenAI attempt hooks missing')
            const restoreCap = overrideDynamicConfigFieldsForTest(spendCapConfig, {
              enabled: true,
              daily_cap_microunits: 0,
            })
            try {
              // The first physical attempt was a known-unbilled flex capacity rejection.
              await hooks.beforeAttempt({ attempt: 2, requestStartedAt: new Date() })
            } finally {
              restoreCap()
            }
            throw new Error('Spend cap should have blocked the resend')
          },
        }),
      ).rejects.toMatchObject({ name: 'SpendCapBreachError' })
      await expect(
        getAgentCallReceipt(agentCallOperationKey(params.agentSlug, operationId)),
      ).resolves.toBeUndefined()

      const output = { title: 'Allowed after cap clears', ai_summary_markdown: 'One summary.' }
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: () => Promise.resolve(makeModelCallResult(output)),
        }),
      ).resolves.toMatchObject({ output })
    } finally {
      restoreAdmission()
    }
  })
})

describe('paid agent receipt after provider validation', () => {
  it.each([
    {
      name: 'unsupported model',
      selection: { provider: 'openai' as const, model: 'unpriced-test-model' },
      rejectBeforeDispatch: () =>
        assertSupportedRequest({ provider: 'openai', model: 'unpriced-test-model' }, {}),
      code: 'unsupported-parameter',
    },
    {
      name: 'missing Anthropic client credentials',
      selection: { provider: 'anthropic' as const, model: 'claude-haiku-5-5' },
      rejectBeforeDispatch: () => resolveAnthropicCredentials({}),
      code: 'client-unavailable',
    },
  ])('releases a known-unbilled $name reservation so a corrected call can run', async fixture => {
    await spendCapConfig.waitForInitialization()
    const restoreAdmission = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const operationId = randomUUID()
    const params = {
      agentSlug: 'story-post',
      operationId,
      promptVersion: 'story-post-test-v1',
      selection: fixture.selection,
      input: 'One fixed story prompt',
      safetyIdentifier: operationId,
    }
    try {
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: async () => {
            fixture.rejectBeforeDispatch()
            throw new Error('Provider validation should have rejected the request')
          },
        }),
      ).rejects.toMatchObject({ code: fixture.code })
      await expect(
        getAgentCallReceipt(agentCallOperationKey(params.agentSlug, operationId)),
      ).resolves.toBeUndefined()

      const output = { title: 'Allowed after provider configuration is corrected' }
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: () => Promise.resolve(makeModelCallResult(output)),
        }),
      ).resolves.toMatchObject({ output })
    } finally {
      restoreAdmission()
    }
  })

  it('retains a post-dispatch 4xx reservation even when billed flags are absent', async () => {
    await spendCapConfig.waitForInitialization()
    const restoreAdmission = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const operationId = randomUUID()
    const params = {
      agentSlug: 'story-post',
      operationId,
      promptVersion: 'story-post-test-v1',
      selection: TEST_OPENAI_SELECTION,
      input: 'One fixed story prompt',
      safetyIdentifier: operationId,
    }
    try {
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: () =>
            Promise.reject(
              new ModelProviderError('invalid-request', 'Provider returned HTTP 400.', {
                retryClass: 'permanent',
                status: 400,
              }),
            ),
        }),
      ).rejects.toMatchObject({ code: 'invalid-request', status: 400 })
      await expect(
        getAgentCallReceipt(agentCallOperationKey(params.agentSlug, operationId)),
      ).resolves.toMatchObject({ result_ciphertext: null })

      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: () => Promise.resolve(makeModelCallResult({ title: 'Must not retry' })),
        }),
      ).rejects.toThrow(/uncertain receipt/)
    } finally {
      restoreAdmission()
    }
  })

  it.each(['direct', 'openrouter'] as const)(
    'releases a missing %s client credential without dispatching a request',
    async transport => {
      await spendCapConfig.waitForInitialization()
      const restoreAdmission = overrideDynamicConfigFieldsForTest(spendCapConfig, {
        enabled: false,
      })
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('OPENROUTER_API_KEY', '')
      const operationId = randomUUID()
      const params = {
        agentSlug: 'story-post',
        operationId,
        promptVersion: 'story-post-test-v1',
        selection: TEST_OPENAI_SELECTION,
        input: 'One fixed story prompt',
        safetyIdentifier: operationId,
      }
      try {
        await expect(
          callReceiptedAgentModel({
            ...params,
            callModel: () =>
              callOpenAIJson(TEST_OPENAI_SELECTION.model, transport, {
                instructions: 'Return a title.',
                input: params.input,
                schemaName: 'title',
                schema: {
                  type: 'object',
                  properties: { title: { type: 'string' } },
                  required: ['title'],
                  additionalProperties: false,
                },
                parse: value => value as { title: string },
                maxOutputTokens: 100,
              }),
          }),
        ).rejects.toMatchObject({
          name: 'ModelProviderError',
          code: 'client-unavailable',
          retryClass: 'permanent',
          ambiguousBilled: false,
          billedResponse: undefined,
          cause: { name: 'MissingModelClientCredentialError' },
        })
        await expect(
          getAgentCallReceipt(agentCallOperationKey(params.agentSlug, operationId)),
        ).resolves.toBeUndefined()

        const output = { title: 'Allowed after credentials are corrected' }
        await expect(
          callReceiptedAgentModel({
            ...params,
            callModel: () => Promise.resolve(makeModelCallResult(output)),
          }),
        ).resolves.toMatchObject({ output })
      } finally {
        vi.unstubAllEnvs()
        restoreAdmission()
      }
    },
  )
})
